/**
 * Manual CreatorScheduleEvent CRUD — Studio Core social reminders.
 * Standalone URLs do not create fake Relay posts.
 *
 * @see docs/studio/PLAN_MANUAL_SOCIAL_EVENTS.md
 */

import type {
  CreatorScheduleEventStatus,
  CreatorScheduleEventType,
  PrismaClient
} from "@prisma/client";
import { CreatorPlan } from "@prisma/client";
import {
  confirmPlatformInstanceLink,
  type PlatformInstanceLinkErrorCode
} from "../analytics/platform-instance-link-service.js";
import {
  detectPlatformPublishedUrl,
  parsePlatformPublishedUrl,
  supportsPlatformIdentityLinking
} from "../analytics/platform-identity-adapters.js";
import { requireCreatorPlanAtLeast } from "../billing/creator-plan-entitlement-service.js";
import {
  CREATOR_SCHEDULE_DESTINATIONS,
  EVENT_TYPE_LABELS,
  extensionTransportActionForEventType,
  isCreatorScheduleDestination,
  isCreatorScheduleEventType,
  transportActionForEventType,
  type CreateCreatorScheduleEventBody,
  type CreatorScheduleDestinationWire,
  type CreatorScheduleEventTypeWire,
  type CreatorScheduleEventWire,
  type MissingPlatformLinkPayload,
  type PatchCreatorScheduleEventBody
} from "./creator-schedule-event-contract.js";

export class CreatorScheduleEventValidationError extends Error {
  public override readonly name = "CreatorScheduleEventValidationError";
  public readonly statusCode = 400;
  public constructor(message: string) {
    super(message);
  }
}

export class CreatorScheduleEventNotFoundError extends Error {
  public override readonly name = "CreatorScheduleEventNotFoundError";
  public readonly statusCode = 404;
  public constructor(message: string) {
    super(message);
  }
}

export class CreatorScheduleEventPlanRequiredError extends Error {
  public override readonly name = "CreatorScheduleEventPlanRequiredError";
  public readonly statusCode = 402;
  public readonly required_plan = "studio_core" as const;
  public constructor() {
    super("Studio Core plan required for manual schedule events.");
  }
}

export class CreatorScheduleEventMissingLinkError extends Error {
  public override readonly name = "CreatorScheduleEventMissingLinkError";
  public readonly statusCode = 409;
  public readonly payload: MissingPlatformLinkPayload;
  public constructor(payload: MissingPlatformLinkPayload) {
    super(payload.message);
    this.payload = payload;
  }
}

const DEST_HOSTS: Record<CreatorScheduleDestinationWire, string[]> = {
  x: ["x.com", "twitter.com"],
  patreon: ["patreon.com"],
  deviantart: ["deviantart.com"],
  bluesky: ["bsky.app"]
};

function hostAllowed(hostname: string, destination: CreatorScheduleDestinationWire): boolean {
  const host = hostname.toLowerCase().replace(/^www\./, "");
  return DEST_HOSTS[destination].some(
    (allowed) => host === allowed || host.endsWith(`.${allowed}`)
  );
}

/**
 * Custom events: safe http(s) only — no platform host / published-post pattern.
 * Future: optional app integrations (Gmail, Slack, Discord, …) beyond raw URLs.
 * Never log the URL.
 */
export function canonicalizeLooseExternalUrl(
  rawUrl: string
): { ok: true; url: string } | { ok: false; message: string } {
  const trimmed = rawUrl.trim();
  if (!trimmed) return { ok: false, message: "external_url is required." };

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, message: "external_url must be a valid URL." };
  }
  const protocol = parsed.protocol.toLowerCase();
  if (protocol === "javascript:" || protocol === "data:" || protocol === "file:" || protocol === "vbscript:") {
    return { ok: false, message: "external_url scheme is not allowed." };
  }
  if (protocol !== "https:" && protocol !== "http:") {
    return { ok: false, message: "external_url must be http(s)." };
  }
  if (!parsed.hostname) {
    return { ok: false, message: "external_url must include a host." };
  }
  // Prefer https when the creator typed http for a public host.
  if (parsed.protocol === "http:") {
    parsed.protocol = "https:";
  }
  return { ok: true, url: parsed.href };
}

/**
 * Platform destination URL: host + published-post pattern (identity / social upkeep).
 * Never log the URL.
 */
export function canonicalizeScheduleExternalUrl(
  destination: CreatorScheduleDestinationWire,
  rawUrl: string
): { ok: true; url: string } | { ok: false; message: string } {
  const trimmed = rawUrl.trim();
  if (!trimmed) return { ok: false, message: "external_url is required." };

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, message: "external_url must be a valid URL." };
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { ok: false, message: "external_url must be http(s)." };
  }
  if (!hostAllowed(parsed.hostname, destination)) {
    return { ok: false, message: "URL host does not match the selected destination." };
  }

  if (destination === "bluesky") {
    const canonical = new URL(parsed.href);
    canonical.hash = "";
    canonical.hostname = canonical.hostname.toLowerCase();
    if (canonical.protocol === "http:") canonical.protocol = "https:";
    return { ok: true, url: canonical.href.replace(/\/$/, "") };
  }

  if (!supportsPlatformIdentityLinking(destination)) {
    return { ok: false, message: "Destination does not support URL identity yet." };
  }

  const identity =
    parsePlatformPublishedUrl(destination as "patreon" | "x" | "deviantart", trimmed) ??
    detectPlatformPublishedUrl(trimmed);

  if (!identity || identity.destination !== destination) {
    return {
      ok: false,
      message: "URL does not match the selected platform's published-post pattern."
    };
  }
  return { ok: true, url: identity.canonical_url };
}

function defaultTitle(
  eventType: CreatorScheduleEventTypeWire,
  destination: CreatorScheduleDestinationWire | null
): string {
  if (eventType === "custom" || !destination) {
    return EVENT_TYPE_LABELS[eventType];
  }
  const dest =
    destination === "x"
      ? "X"
      : destination === "patreon"
        ? "Patreon"
        : destination === "deviantart"
          ? "DeviantArt"
          : "Bluesky";
  return `${EVENT_TYPE_LABELS[eventType]} · ${dest}`;
}

function toWire(row: {
  id: string;
  eventType: CreatorScheduleEventType;
  destination: string | null;
  title: string;
  note: string | null;
  dueAt: Date;
  postId: string | null;
  externalUrl: string | null;
  remindMe: boolean;
  status: CreatorScheduleEventStatus;
  createdAt: Date;
  updatedAt: Date;
}): CreatorScheduleEventWire {
  const eventType = row.eventType as CreatorScheduleEventTypeWire;
  const destination =
    row.destination && isCreatorScheduleDestination(row.destination)
      ? row.destination
      : null;
  return {
    id: row.id,
    source: "manual_event",
    event_type: eventType,
    action: transportActionForEventType(eventType),
    destination,
    title: row.title,
    note: row.note,
    due_at: row.dueAt.toISOString(),
    post_id: row.postId,
    external_url: row.externalUrl,
    remind_me: row.remindMe,
    status: row.status,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString()
  };
}

async function assertStudioCore(prisma: PrismaClient, creatorId: string): Promise<void> {
  const gate = await requireCreatorPlanAtLeast(prisma, creatorId, CreatorPlan.studio_core);
  if (!gate.ok) {
    throw new CreatorScheduleEventPlanRequiredError();
  }
}

async function resolvePlatformUrlForPost(
  prisma: PrismaClient,
  creatorId: string,
  postId: string,
  destination: CreatorScheduleDestinationWire
): Promise<string | null> {
  const instance = await prisma.platformInstance.findFirst({
    where: {
      creatorId,
      postId,
      destination,
      externalUrl: { not: null }
    },
    select: { externalUrl: true }
  });
  const fromInstance = instance?.externalUrl?.trim();
  if (fromInstance) return fromInstance;

  const attempt = await prisma.postDistributionAttempt.findFirst({
    where: {
      creatorId,
      postId,
      destination,
      externalUrl: { not: null }
    },
    orderBy: { startedAt: "desc" },
    select: { externalUrl: true }
  });
  return attempt?.externalUrl?.trim() || null;
}

function requiresDestinationUrl(eventType: CreatorScheduleEventTypeWire): boolean {
  return (
    eventType === "engage_comments" ||
    eventType === "pin_comment" ||
    eventType === "repost"
  );
}

export type CreateCreatorScheduleEventResult =
  | { ok: true; event: CreatorScheduleEventWire }
  | { ok: false; missing_link: MissingPlatformLinkPayload };

/**
 * Create a manual schedule event (standalone URL and/or linked post).
 * Relay draft creation stays on POST .../scheduled-posts (legacy make_post adapter).
 */
export async function createCreatorScheduleEvent(
  prisma: PrismaClient,
  creatorId: string,
  body: CreateCreatorScheduleEventBody
): Promise<CreateCreatorScheduleEventResult> {
  const id = creatorId.trim();
  await assertStudioCore(prisma, id);

  if (!isCreatorScheduleEventType(body.event_type)) {
    throw new CreatorScheduleEventValidationError(
      "event_type must be make_post, schedule_post, engage_comments, pin_comment, repost, or custom."
    );
  }

  const eventType = body.event_type;
  const isCustom = eventType === "custom";

  let destination: CreatorScheduleDestinationWire | null = null;
  if (isCustom) {
    destination = null;
  } else if (isCreatorScheduleDestination(body.destination)) {
    destination = body.destination;
  } else {
    throw new CreatorScheduleEventValidationError(
      "destination must be patreon, x, deviantart, or bluesky."
    );
  }

  const dueAt = new Date(body.due_at);
  if (Number.isNaN(dueAt.getTime())) {
    throw new CreatorScheduleEventValidationError("due_at must be a valid date-time.");
  }

  const postId = isCustom ? null : body.post_id?.trim() || null;
  const rawUrl = body.external_url?.trim() || null;
  const remindMe = body.remind_me !== false;
  const note = body.note?.trim() || null;
  const title = (body.title?.trim() || defaultTitle(eventType, destination)).slice(0, 200);

  let externalUrl: string | null = null;

  if (isCustom) {
    if (rawUrl) {
      const canon = canonicalizeLooseExternalUrl(rawUrl);
      if (!canon.ok) {
        throw new CreatorScheduleEventValidationError(canon.message);
      }
      externalUrl = canon.url;
    }
  } else if (postId) {
    const post = await prisma.post.findFirst({
      where: { id: postId, creatorId: id },
      select: { id: true }
    });
    if (!post) {
      throw new CreatorScheduleEventNotFoundError("Post not found.");
    }

    const linked = await resolvePlatformUrlForPost(prisma, id, postId, destination!);
    if (linked) {
      externalUrl = linked;
    } else if (rawUrl) {
      const canon = canonicalizeScheduleExternalUrl(destination!, rawUrl);
      if (!canon.ok) {
        throw new CreatorScheduleEventValidationError(canon.message);
      }
      const linkOut = await confirmPlatformInstanceLink(prisma, id, {
        postId,
        destination: destination!,
        externalUrl: canon.url,
        linkSource: "manual_url_confirm"
      });
      if (!linkOut.ok) {
        throw mapLinkError(linkOut.code, linkOut.message);
      }
      externalUrl = linkOut.link.external_url;
    } else if (requiresDestinationUrl(eventType)) {
      return {
        ok: false,
        missing_link: {
          error: "missing_platform_link",
          post_id: postId,
          destination: destination!,
          message: `Link the ${destination} version of this post to continue.`
        }
      };
    }
  } else if (rawUrl) {
    const canon = canonicalizeScheduleExternalUrl(destination!, rawUrl);
    if (!canon.ok) {
      throw new CreatorScheduleEventValidationError(canon.message);
    }
    externalUrl = canon.url;
  } else if (requiresDestinationUrl(eventType)) {
    throw new CreatorScheduleEventValidationError(
      "engage_comments, pin_comment, and repost require a destination URL or a linked post with that platform URL."
    );
  }

  const row = await prisma.creatorScheduleEvent.create({
    data: {
      creatorId: id,
      eventType,
      destination,
      title,
      note,
      dueAt,
      postId,
      externalUrl,
      remindMe,
      status: "pending"
    }
  });

  return { ok: true, event: toWire(row) };
}

function mapLinkError(
  code: PlatformInstanceLinkErrorCode,
  message?: string
): CreatorScheduleEventValidationError {
  switch (code) {
    case "URL_DESTINATION_MISMATCH":
      return new CreatorScheduleEventValidationError(
        message ?? "URL does not match the selected platform."
      );
    case "UNSUPPORTED_DESTINATION":
      return new CreatorScheduleEventValidationError(
        message ?? "Destination does not support URL linking."
      );
    case "NOT_FOUND":
      return new CreatorScheduleEventValidationError(message ?? "Post not found.");
    case "INVALID_INPUT":
      return new CreatorScheduleEventValidationError(message ?? "Invalid link input.");
    case "NO_TENANT":
      return new CreatorScheduleEventValidationError("Creator workspace not ready.");
    default:
      return new CreatorScheduleEventValidationError(message ?? "Could not link platform URL.");
  }
}

export async function patchCreatorScheduleEvent(
  prisma: PrismaClient,
  creatorId: string,
  eventId: string,
  body: PatchCreatorScheduleEventBody
): Promise<CreatorScheduleEventWire> {
  const id = creatorId.trim();
  await assertStudioCore(prisma, id);

  const existing = await prisma.creatorScheduleEvent.findFirst({
    where: { id: eventId.trim(), creatorId: id }
  });
  if (!existing) {
    throw new CreatorScheduleEventNotFoundError("Schedule event not found.");
  }

  const data: {
    title?: string;
    note?: string | null;
    dueAt?: Date;
    remindMe?: boolean;
    status?: CreatorScheduleEventStatus;
    externalUrl?: string | null;
  } = {};

  if (typeof body.title === "string") {
    data.title = body.title.trim().slice(0, 200) || existing.title;
  }
  if (body.note !== undefined) {
    data.note = typeof body.note === "string" ? body.note.trim() || null : null;
  }
  if (typeof body.due_at === "string") {
    const dueAt = new Date(body.due_at);
    if (Number.isNaN(dueAt.getTime())) {
      throw new CreatorScheduleEventValidationError("due_at must be a valid date-time.");
    }
    data.dueAt = dueAt;
  }
  if (typeof body.remind_me === "boolean") {
    data.remindMe = body.remind_me;
  }
  if (body.status === "pending" || body.status === "done" || body.status === "dismissed") {
    data.status = body.status;
  }
  if (body.external_url !== undefined) {
    if (body.external_url === null || body.external_url.trim() === "") {
      data.externalUrl = null;
    } else if (existing.eventType === "custom" || !existing.destination) {
      const canon = canonicalizeLooseExternalUrl(body.external_url);
      if (!canon.ok) {
        throw new CreatorScheduleEventValidationError(canon.message);
      }
      data.externalUrl = canon.url;
    } else {
      const dest = existing.destination as CreatorScheduleDestinationWire;
      if (!isCreatorScheduleDestination(dest)) {
        throw new CreatorScheduleEventValidationError("Event destination is invalid.");
      }
      const canon = canonicalizeScheduleExternalUrl(dest, body.external_url);
      if (!canon.ok) {
        throw new CreatorScheduleEventValidationError(canon.message);
      }
      data.externalUrl = canon.url;
      if (existing.postId) {
        const linkOut = await confirmPlatformInstanceLink(prisma, id, {
          postId: existing.postId,
          destination: dest,
          externalUrl: canon.url,
          linkSource: "manual_url_confirm"
        });
        if (!linkOut.ok) {
          throw mapLinkError(linkOut.code, linkOut.message);
        }
        data.externalUrl = linkOut.link.external_url;
      }
    }
  }

  const updated = await prisma.creatorScheduleEvent.update({
    where: { id: existing.id },
    data
  });
  return toWire(updated);
}

export type LibraryPostPickerRow = {
  post_id: string;
  title: string;
  published_at: string | null;
  destinations: Array<{
    destination: CreatorScheduleDestinationWire;
    has_url: boolean;
  }>;
};

/** Creator-scoped Library posts for the Create Event picker. */
export async function listScheduleLibraryPosts(
  prisma: PrismaClient,
  creatorId: string,
  options?: { limit?: number; q?: string }
): Promise<LibraryPostPickerRow[]> {
  const id = creatorId.trim();
  await assertStudioCore(prisma, id);
  const limit = Math.min(50, Math.max(1, options?.limit ?? 30));
  const q = options?.q?.trim().toLowerCase() ?? "";

  const posts = await prisma.post.findMany({
    where: { creatorId: id },
    orderBy: { createdAt: "desc" },
    take: 80,
    select: {
      id: true,
      createdAt: true,
      versions: {
        orderBy: { versionSeq: "desc" },
        take: 1,
        select: { title: true, publishedAt: true }
      },
      platformInstances: {
        where: { externalUrl: { not: null } },
        select: { destination: true, externalUrl: true }
      }
    }
  });

  const out: LibraryPostPickerRow[] = [];
  for (const post of posts) {
    if (out.length >= limit) break;
    const title = post.versions[0]?.title?.trim() || "Untitled";
    if (q && !title.toLowerCase().includes(q) && !post.id.toLowerCase().includes(q)) {
      continue;
    }
    const urlByDest = new Map<string, boolean>();
    for (const inst of post.platformInstances) {
      if (inst.externalUrl?.trim()) urlByDest.set(inst.destination, true);
    }
    out.push({
      post_id: post.id,
      title,
      published_at: post.versions[0]?.publishedAt?.toISOString() ?? null,
      destinations: CREATOR_SCHEDULE_DESTINATIONS.map((destination) => ({
        destination,
        has_url: urlByDest.get(destination) === true
      }))
    });
  }
  return out;
}

export function mapManualEventToRailFields(row: {
  id: string;
  eventType: CreatorScheduleEventType;
  destination: string | null;
  title: string;
  note: string | null;
  dueAt: Date;
  postId: string | null;
  externalUrl: string | null;
  remindMe: boolean;
  status: CreatorScheduleEventStatus;
}): {
  id: string;
  source: "manual_event";
  event_type: CreatorScheduleEventTypeWire;
  action: ReturnType<typeof transportActionForEventType>;
  extension_action: ReturnType<typeof extensionTransportActionForEventType>;
  title: string;
  rationale: string | null;
  destination: CreatorScheduleDestinationWire | null;
  link: string | null;
  notify: boolean;
  post_id: string | null;
  at: string;
  status: "pending" | "done" | "overdue";
  needs_media: boolean;
  media_count: number;
} {
  const eventType = row.eventType as CreatorScheduleEventTypeWire;
  const dest = isCreatorScheduleDestination(row.destination) ? row.destination : null;
  const now = Date.now();
  let status: "pending" | "done" | "overdue" = "pending";
  if (row.status === "done") status = "done";
  else if (row.status === "dismissed") status = "pending"; // filtered upstream
  else if (row.dueAt.getTime() < now) status = "overdue";

  return {
    id: row.id,
    source: "manual_event",
    event_type: eventType,
    action: transportActionForEventType(eventType),
    extension_action: extensionTransportActionForEventType(eventType),
    title: row.title,
    rationale: row.note,
    destination: dest,
    link: row.externalUrl,
    notify: row.remindMe,
    post_id: row.postId,
    at: row.dueAt.toISOString(),
    status,
    needs_media: false,
    media_count: 0
  };
}
