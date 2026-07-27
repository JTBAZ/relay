/**
 * @fileoverview JSON file persistence for patron-facing Patreon webhook metadata (opaque URL tokens, encrypted HMAC secrets, registration status).
 * @description Complements relational dual-write (`WebhookEndpoint`) — delivery routing prefers the file store, then falls back to Postgres when the volume is empty/stale.
 * @async All public methods perform disk I/O (and optional Prisma reads).
 * @throws {Error} Read/write failures.
 * @see {@link ../jsdoc-core-entities.ts}
 * @security-audit-required Encrypts/decrypts webhook secrets; never log plaintext secrets or tokens.
 */
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { PrismaClient, WebhookEndpoint } from "@prisma/client";
import type { TokenEncryption } from "../lib/crypto.js";

export type WebhookRegistrationStatus = "ok" | "failed" | "skipped_no_public_url";

export type PatreonWebhookMetaRecord = {
  webhook_id?: string;
  /** Encrypted Patreon webhook secret (HMAC key). */
  encrypted_webhook_secret?: string;
  opaque_delivery_token: string;
  uri_registered?: string;
  triggers?: string[];
  updated_at: string;
  registration_status: WebhookRegistrationStatus;
  last_registration_error?: string;
};

type StoreRoot = {
  /** creator_id → metadata */
  records: Record<string, PatreonWebhookMetaRecord>;
  /** opaque token → creator_id */
  token_index: Record<string, string>;
};

export type WebhookPublicSummary = {
  registration_status: WebhookRegistrationStatus;
  uri_registered?: string;
  triggers?: string[];
  last_registration_error?: string;
  updated_at?: string;
};

function normalizeRegistrationStatus(raw: string | null | undefined): WebhookRegistrationStatus {
  if (raw === "ok" || raw === "failed" || raw === "skipped_no_public_url") {
    return raw;
  }
  return "failed";
}

function triggersFromJson(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const triggers = raw.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
  return triggers.length > 0 ? triggers : undefined;
}

function recordFromWebhookEndpointRow(row: WebhookEndpoint): PatreonWebhookMetaRecord | null {
  const token = row.opaqueDeliveryToken?.trim();
  if (!token) return null;
  return {
    webhook_id: row.patreonWebhookId ?? undefined,
    encrypted_webhook_secret: row.encryptedSecret
      ? Buffer.from(row.encryptedSecret).toString("utf8")
      : undefined,
    opaque_delivery_token: token,
    uri_registered: row.uriRegistered ?? undefined,
    triggers: triggersFromJson(row.triggers),
    updated_at: row.updatedAt.toISOString(),
    registration_status: normalizeRegistrationStatus(row.registrationStatus)
  };
}

export class PatreonWebhookMetadataStore {
  private readonly filePath: string;
  private readonly encryption: TokenEncryption;
  private readonly prisma: PrismaClient | null;

  public constructor(
    filePath: string,
    encryption: TokenEncryption,
    prisma?: PrismaClient | null
  ) {
    this.filePath = filePath;
    this.encryption = encryption;
    this.prisma = prisma ?? null;
  }

  private async readRoot(): Promise<StoreRoot> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      return JSON.parse(raw) as StoreRoot;
    } catch {
      return { records: {}, token_index: {} };
    }
  }

  private async writeRoot(root: StoreRoot): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(root, null, 2), "utf8");
  }

  /** Best-effort heal of the file store after a Postgres dual-read hit. */
  private async hydrateFileFromRecord(creatorId: string, rec: PatreonWebhookMetaRecord): Promise<void> {
    try {
      const root = await this.readRoot();
      const existing = root.records[creatorId];
      if (existing?.opaque_delivery_token === rec.opaque_delivery_token && existing.encrypted_webhook_secret) {
        return;
      }
      root.records[creatorId] = { ...existing, ...rec };
      root.token_index[rec.opaque_delivery_token] = creatorId;
      await this.writeRoot(root);
    } catch {
      // File volume may be read-only in some test harnesses; dual-read still succeeds.
    }
  }

  private async getByCreatorIdFromDb(creatorId: string): Promise<PatreonWebhookMetaRecord | null> {
    if (!this.prisma) return null;
    const row = await this.prisma.webhookEndpoint.findUnique({
      where: { relayCreatorId: creatorId }
    });
    if (!row) return null;
    const rec = recordFromWebhookEndpointRow(row);
    if (rec) {
      await this.hydrateFileFromRecord(creatorId, rec);
    }
    return rec;
  }

  public async getByCreatorId(creatorId: string): Promise<PatreonWebhookMetaRecord | null> {
    const root = await this.readRoot();
    const fromFile = root.records[creatorId] ?? null;
    if (fromFile) return fromFile;
    return this.getByCreatorIdFromDb(creatorId);
  }

  public async getCreatorIdForOpaqueToken(opaque: string): Promise<string | null> {
    const t = opaque.trim();
    if (!t) return null;
    const root = await this.readRoot();
    const fromFile = root.token_index[t] ?? null;
    if (fromFile) return fromFile;
    if (!this.prisma) return null;
    const row = await this.prisma.webhookEndpoint.findUnique({
      where: { opaqueDeliveryToken: t },
      select: { relayCreatorId: true, opaqueDeliveryToken: true }
    });
    if (!row?.relayCreatorId) return null;
    const rec = await this.getByCreatorIdFromDb(row.relayCreatorId);
    if (rec) {
      await this.hydrateFileFromRecord(row.relayCreatorId, rec);
    }
    return row.relayCreatorId;
  }

  public getPublicSummary(rec: PatreonWebhookMetaRecord | null): WebhookPublicSummary | null {
    if (!rec) return null;
    return {
      registration_status: rec.registration_status,
      uri_registered: rec.uri_registered,
      triggers: rec.triggers,
      last_registration_error: rec.last_registration_error,
      updated_at: rec.updated_at
    };
  }

  public decryptWebhookSecret(rec: PatreonWebhookMetaRecord): string | null {
    if (!rec.encrypted_webhook_secret) return null;
    try {
      return this.encryption.decrypt(rec.encrypted_webhook_secret);
    } catch {
      return null;
    }
  }

  /**
   * Ensure an opaque delivery token exists for URI construction (idempotent).
   */
  public async ensureOpaqueToken(creatorId: string): Promise<string> {
    const root = await this.readRoot();
    const existing = root.records[creatorId]?.opaque_delivery_token;
    if (existing) {
      return existing;
    }
    const token = randomBytes(24).toString("hex");
    const now = new Date().toISOString();
    root.records[creatorId] = {
      ...root.records[creatorId],
      opaque_delivery_token: token,
      updated_at: now,
      registration_status: root.records[creatorId]?.registration_status ?? "failed",
      last_registration_error: root.records[creatorId]?.last_registration_error
    };
    root.token_index[token] = creatorId;
    await this.writeRoot(root);
    return token;
  }

  public async recordRegistration(args: {
    creator_id: string;
    webhook_id: string;
    webhook_secret: string;
    uri: string;
    triggers: string[];
    status: WebhookRegistrationStatus;
    error?: string;
  }): Promise<void> {
    const root = await this.readRoot();
    let rec = root.records[args.creator_id];
    const token = rec?.opaque_delivery_token ?? randomBytes(24).toString("hex");
    const now = new Date().toISOString();
    rec = {
      ...rec,
      webhook_id: args.webhook_id,
      encrypted_webhook_secret: this.encryption.encrypt(args.webhook_secret),
      opaque_delivery_token: token,
      uri_registered: args.uri,
      triggers: args.triggers,
      updated_at: now,
      registration_status: args.status,
      last_registration_error: args.status === "ok" ? undefined : args.error
    };
    root.records[args.creator_id] = rec;
    root.token_index[token] = args.creator_id;
    await this.writeRoot(root);
  }

  public async recordSkippedNoPublicUrl(creatorId: string, detail?: string): Promise<void> {
    const root = await this.readRoot();
    const token =
      root.records[creatorId]?.opaque_delivery_token ?? randomBytes(24).toString("hex");
    const now = new Date().toISOString();
    root.records[creatorId] = {
      ...root.records[creatorId],
      opaque_delivery_token: token,
      updated_at: now,
      registration_status: "skipped_no_public_url",
      last_registration_error: detail ?? "RELAY_PUBLIC_WEBHOOK_BASE_URL is not set"
    };
    root.token_index[token] = creatorId;
    await this.writeRoot(root);
  }

  public async recordRegistrationFailure(creatorId: string, message: string): Promise<void> {
    const root = await this.readRoot();
    const token =
      root.records[creatorId]?.opaque_delivery_token ?? randomBytes(24).toString("hex");
    const now = new Date().toISOString();
    root.records[creatorId] = {
      ...root.records[creatorId],
      opaque_delivery_token: token,
      updated_at: now,
      registration_status: "failed",
      last_registration_error: message.slice(0, 500)
    };
    root.token_index[token] = creatorId;
    await this.writeRoot(root);
  }
}
