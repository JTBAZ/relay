import { randomUUID } from "node:crypto";
import {
  MediaIngestOrigin,
  MediaProcessingStatus,
  MediaUpstreamStatus,
  Prisma,
  type PrismaClient
} from "@prisma/client";
import type { R2ClientConfig } from "../storage/r2-config.js";
import {
  buildRelayR2ObjectKey,
  getAllowedMimePrefixesFromEnv,
  getRelayUploadMaxBytes,
  headR2ObjectContentLength,
  isMimeTypeAllowed,
  putR2ObjectBuffer
} from "../storage/relay-upload-r2.js";

export type DiscordIngestAttachmentInput = {
  id: string;
  url: string;
  content_type?: string | null;
  byte_size?: number | null;
};

export type DiscordIngestPayload = {
  discord_guild_id: string;
  discord_channel_id: string;
  discord_message_id: string;
  message_content?: string | null;
  message_timestamp?: string | null;
  attachments: DiscordIngestAttachmentInput[];
};

export type DiscordIngestResultRow = {
  discord_attachment_id: string;
  status: "created" | "idempotent" | "skipped" | "error";
  media_id?: string;
  message?: string;
};

export type DiscordIngestOutcome = {
  relay_creator_id: string;
  results: DiscordIngestResultRow[];
};

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

/** Validate and normalize JSON body from the Discord bridge. */
export function parseDiscordIngestPayload(body: unknown): DiscordIngestPayload | null {
  if (!body || typeof body !== "object") {
    return null;
  }
  const o = body as Record<string, unknown>;
  if (
    !isNonEmptyString(o.discord_guild_id) ||
    !isNonEmptyString(o.discord_channel_id) ||
    !isNonEmptyString(o.discord_message_id)
  ) {
    return null;
  }
  if (!Array.isArray(o.attachments)) {
    return null;
  }
  const attachments: DiscordIngestAttachmentInput[] = [];
  for (const a of o.attachments) {
    if (!a || typeof a !== "object") {
      return null;
    }
    const ar = a as Record<string, unknown>;
    if (!isNonEmptyString(ar.id) || !isNonEmptyString(ar.url)) {
      return null;
    }
    attachments.push({
      id: ar.id.trim(),
      url: ar.url.trim(),
      content_type:
        ar.content_type === null || ar.content_type === undefined
          ? null
          : typeof ar.content_type === "string"
            ? ar.content_type
            : null,
      byte_size:
        typeof ar.byte_size === "number" && Number.isFinite(ar.byte_size) ? ar.byte_size : null
    });
  }
  return {
    discord_guild_id: o.discord_guild_id.trim(),
    discord_channel_id: o.discord_channel_id.trim(),
    discord_message_id: o.discord_message_id.trim(),
    message_content:
      o.message_content === null || o.message_content === undefined
        ? null
        : typeof o.message_content === "string"
          ? o.message_content
          : null,
    message_timestamp:
      o.message_timestamp === null || o.message_timestamp === undefined
        ? null
        : typeof o.message_timestamp === "string"
          ? o.message_timestamp
          : null,
    attachments
  };
}

export function getDiscordBotTokenFromEnv(): string | null {
  const t = process.env.RELAY_DISCORD_BOT_TOKEN?.trim();
  return t || null;
}

async function fetchDiscordAttachment(
  url: string,
  fetchImpl: typeof fetch,
  botToken: string | null
): Promise<{ buffer: Buffer; contentType: string }> {
  const headers: Record<string, string> = {
    Accept: "*/*",
    "User-Agent": "RelayDiscordIngest/1.0"
  };
  if (botToken) {
    headers.Authorization = `Bot ${botToken}`;
  }
  const res = await fetchImpl(url, { headers, redirect: "follow" });
  if (!res.ok) {
    throw new Error(`Discord attachment fetch failed: HTTP ${res.status}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const ct =
    res.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() || "application/octet-stream";
  return { buffer: buf, contentType: ct };
}

/**
 * HMAC-authenticated Discord bridge → download attachment(s) → R2 → `MediaAsset` + `DiscordMediaIngestKey`.
 */
export async function executeDiscordIngest(
  prisma: PrismaClient,
  r2: R2ClientConfig,
  payload: DiscordIngestPayload,
  fetchImpl: typeof fetch
): Promise<DiscordIngestOutcome | { error: "binding_not_found" }> {
  const binding = await prisma.discordChannelBinding.findFirst({
    where: {
      discordGuildId: payload.discord_guild_id,
      discordChannelId: payload.discord_channel_id
    }
  });
  if (!binding) {
    return { error: "binding_not_found" };
  }
  const creatorId = binding.relayCreatorId;
  const maxBytes = getRelayUploadMaxBytes();
  const mimePrefixes = getAllowedMimePrefixesFromEnv();
  const botToken = getDiscordBotTokenFromEnv();

  const results: DiscordIngestResultRow[] = [];

  for (const att of payload.attachments) {
    const existing = await prisma.discordMediaIngestKey.findFirst({
      where: {
        discordGuildId: payload.discord_guild_id,
        discordChannelId: payload.discord_channel_id,
        discordMessageId: payload.discord_message_id,
        discordAttachmentId: att.id
      },
      select: { mediaAssetId: true }
    });
    if (existing) {
      results.push({
        discord_attachment_id: att.id,
        status: "idempotent",
        media_id: existing.mediaAssetId
      });
      continue;
    }

    let buffer: Buffer;
    let resolvedMime: string;
    try {
      const fetched = await fetchDiscordAttachment(att.url, fetchImpl, botToken);
      buffer = fetched.buffer;
      resolvedMime = att.content_type?.trim() || fetched.contentType;
    } catch (e) {
      results.push({
        discord_attachment_id: att.id,
        status: "error",
        message: e instanceof Error ? e.message : String(e)
      });
      continue;
    }

    if (buffer.byteLength > maxBytes) {
      results.push({
        discord_attachment_id: att.id,
        status: "skipped",
        message: `attachment exceeds RELAY_UPLOAD_MAX_BYTES (${maxBytes})`
      });
      continue;
    }

    if (!isMimeTypeAllowed(resolvedMime, mimePrefixes)) {
      results.push({
        discord_attachment_id: att.id,
        status: "skipped",
        message: "content type is not in RELAY_UPLOAD_ALLOWED_MIME_PREFIXES"
      });
      continue;
    }

    const mediaId = `relay_m_${randomUUID()}`;
    const key = buildRelayR2ObjectKey(creatorId, mediaId);
    const now = new Date();
    const captureJson = {
      discord_guild_id: payload.discord_guild_id,
      discord_channel_id: payload.discord_channel_id,
      discord_message_id: payload.discord_message_id,
      discord_attachment_id: att.id,
      message_content: payload.message_content ?? null,
      message_timestamp: payload.message_timestamp ?? null
    };

    try {
      await putR2ObjectBuffer(r2, key, buffer, resolvedMime);
    } catch (e) {
      results.push({
        discord_attachment_id: att.id,
        status: "error",
        message: e instanceof Error ? e.message : String(e)
      });
      continue;
    }

    let head: { contentLength: number; etag: string | undefined };
    try {
      head = await headR2ObjectContentLength(r2, key);
    } catch (e) {
      results.push({
        discord_attachment_id: att.id,
        status: "error",
        message: e instanceof Error ? e.message : "R2 head failed after put"
      });
      continue;
    }

    const v = {
      version_seq: 1,
      upstream_revision: "discord:capture",
      mime_type: resolvedMime,
      storage_key: key,
      r2_etag: head.etag != null ? String(head.etag) : undefined,
      ingested_at: now.toISOString()
    };

    try {
      await prisma.$transaction(async (tx) => {
        await tx.mediaAsset.create({
          data: {
            id: mediaId,
            creatorId,
            postIds: [],
            primaryPostId: null,
            upstreamStatus: MediaUpstreamStatus.active,
            currentVersionSeq: 1,
            currentUpstreamRevision: "discord:capture",
            currentMimeType: resolvedMime,
            currentUpstreamUrl: null,
            currentRole: null,
            currentStorageKey: key,
            currentIngestedAt: now,
            versionsJson: [v] as unknown as Prisma.InputJsonValue,
            ingestOrigin: MediaIngestOrigin.DISCORD,
            processingStatus: MediaProcessingStatus.READY,
            processingError: null,
            discordCaptureJson: captureJson as unknown as Prisma.InputJsonValue
          }
        });
        await tx.discordMediaIngestKey.create({
          data: {
            discordGuildId: payload.discord_guild_id,
            discordChannelId: payload.discord_channel_id,
            discordMessageId: payload.discord_message_id,
            discordAttachmentId: att.id,
            mediaAssetId: mediaId
          }
        });
      });
      results.push({
        discord_attachment_id: att.id,
        status: "created",
        media_id: mediaId
      });
    } catch (e) {
      const code = e && typeof e === "object" && "code" in e ? (e as { code?: string }).code : "";
      if (code === "P2002") {
        const again = await prisma.discordMediaIngestKey.findFirst({
          where: {
            discordGuildId: payload.discord_guild_id,
            discordChannelId: payload.discord_channel_id,
            discordMessageId: payload.discord_message_id,
            discordAttachmentId: att.id
          },
          select: { mediaAssetId: true }
        });
        if (again) {
          results.push({
            discord_attachment_id: att.id,
            status: "idempotent",
            media_id: again.mediaAssetId
          });
          continue;
        }
      }
      results.push({
        discord_attachment_id: att.id,
        status: "error",
        message: e instanceof Error ? e.message : String(e)
      });
    }
  }

  return { relay_creator_id: creatorId, results };
}
