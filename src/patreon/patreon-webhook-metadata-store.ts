import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
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

export class PatreonWebhookMetadataStore {
  private readonly filePath: string;
  private readonly encryption: TokenEncryption;

  public constructor(filePath: string, encryption: TokenEncryption) {
    this.filePath = filePath;
    this.encryption = encryption;
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

  public async getByCreatorId(creatorId: string): Promise<PatreonWebhookMetaRecord | null> {
    const root = await this.readRoot();
    return root.records[creatorId] ?? null;
  }

  public async getCreatorIdForOpaqueToken(opaque: string): Promise<string | null> {
    const t = opaque.trim();
    if (!t) return null;
    const root = await this.readRoot();
    return root.token_index[t] ?? null;
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
