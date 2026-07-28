import browser from "./browser.js";
import {
  CrossPostSchemaError,
  parseDeviantArtCrossPostPackage,
  parsePatreonCrossPostPackage,
  parseXCrossPostPackage,
  PENDING_CROSS_POST_STORAGE_KEY,
  type DeviantArtCrossPostPackage,
  type PatreonCrossPostPackage,
  type PendingCrossPostPackage,
  type XCrossPostPackage
} from "./cross-post-types.js";
import type { ExternalMetricsDestination } from "./messages.js";

/** Thrown when stored JSON does not match the expected schema; corrupt keys are cleared first. */
export class StorageSchemaError extends Error {
  public override readonly name = "StorageSchemaError";

  public constructor(message: string) {
    super(message);
  }
}

const K = {
  installationId: "installation_id",
  grant: "grant",
  lastSyncAt: "last_sync_at",
  lastSyncHash: "last_sync_hash",
  lastSyncStatus: "last_sync_status"
} as const;

export type RelayGrant = {
  /** Opaque Bearer for Relay API */
  token: string;
  /** DB session row id — `DELETE /api/v1/auth/extension/grants/:tokenId` */
  token_id: string;
  expires_at: string;
  account_id: string;
  relay_creator_id: string;
  created_at: string;
};

const K_CONSENT_ERR = "consent_last_error" as const;

export type LastSync = {
  /** ISO 8601 timestamp */
  at: string;
  hash: string;
  status: string;
};

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function parseGrant(raw: unknown): RelayGrant {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new StorageSchemaError("grant: not an object");
  }
  const o = raw as Record<string, unknown>;
  const relayCreator =
    o.relay_creator_id === null || o.relay_creator_id === undefined
      ? ""
      : typeof o.relay_creator_id === "string"
        ? o.relay_creator_id.trim()
        : "";
  if (
    !isNonEmptyString(o.token) ||
    !isNonEmptyString(o.token_id) ||
    !isNonEmptyString(o.expires_at) ||
    !isNonEmptyString(o.account_id) ||
    !isNonEmptyString(o.created_at)
  ) {
    throw new StorageSchemaError("grant: missing or invalid fields");
  }
  return {
    token: o.token.trim(),
    token_id: (o.token_id as string).trim(),
    expires_at: o.expires_at.trim(),
    account_id: o.account_id.trim(),
    relay_creator_id: relayCreator,
    created_at: o.created_at.trim()
  };
}

async function removeKeys(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  await browser.storage.local.remove(keys);
}

export async function getInstallationId(): Promise<string | undefined> {
  const r = await browser.storage.local.get(K.installationId);
  const v = r[K.installationId];
  if (v === undefined || v === null) return undefined;
  if (!isNonEmptyString(v)) {
    await removeKeys([K.installationId]);
    throw new StorageSchemaError("installation_id: invalid value");
  }
  return v.trim();
}

export async function setInstallationId(id: string): Promise<void> {
  const t = id.trim();
  if (!t) {
    throw new Error("installation_id must be non-empty");
  }
  await browser.storage.local.set({ [K.installationId]: t });
}

/** Returns existing id or creates a new UUID and persists it. */
export async function ensureInstallationId(): Promise<string> {
  try {
    const existing = await getInstallationId();
    if (existing) return existing;
  } catch {
    /* corrupt key removed in getInstallationId */
  }
  const id = crypto.randomUUID();
  await browser.storage.local.set({ [K.installationId]: id });
  return id;
}

export async function getGrant(): Promise<RelayGrant | undefined> {
  const r = await browser.storage.local.get(K.grant);
  const raw = r[K.grant];
  if (raw === undefined || raw === null) return undefined;
  try {
    return parseGrant(raw);
  } catch (e) {
    await removeKeys([K.grant]);
    if (e instanceof StorageSchemaError) throw e;
    throw new StorageSchemaError("grant: parse failed");
  }
}

export async function setGrant(grant: RelayGrant): Promise<void> {
  const g = parseGrant(grant);
  await browser.storage.local.set({ [K.grant]: g });
}

export async function clearGrant(): Promise<void> {
  await removeKeys([K.grant]);
}

export async function getLastSync(): Promise<LastSync | undefined> {
  const r = await browser.storage.local.get([
    K.lastSyncAt,
    K.lastSyncHash,
    K.lastSyncStatus
  ]);
  const at = r[K.lastSyncAt];
  const hash = r[K.lastSyncHash];
  const status = r[K.lastSyncStatus];
  if (at === undefined && hash === undefined && status === undefined) {
    return undefined;
  }
  if (!isNonEmptyString(at) || !isNonEmptyString(hash) || !isNonEmptyString(status)) {
    await removeKeys([K.lastSyncAt, K.lastSyncHash, K.lastSyncStatus]);
    throw new StorageSchemaError("last_sync: corrupt partial record");
  }
  return { at: at.trim(), hash: hash.trim(), status: status.trim() };
}

export async function setLastSync(row: LastSync): Promise<void> {
  if (!isNonEmptyString(row.at) || !isNonEmptyString(row.hash) || !isNonEmptyString(row.status)) {
    throw new Error("setLastSync: at, hash, and status are required");
  }
  await browser.storage.local.set({
    [K.lastSyncAt]: row.at.trim(),
    [K.lastSyncHash]: row.hash.trim(),
    [K.lastSyncStatus]: row.status.trim()
  });
}

export async function clearLastSync(): Promise<void> {
  await removeKeys([K.lastSyncAt, K.lastSyncHash, K.lastSyncStatus]);
}

export async function getConsentLastError(): Promise<string | undefined> {
  const r = await browser.storage.local.get(K_CONSENT_ERR);
  const v = r[K_CONSENT_ERR];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "string" || !v.trim()) {
    await removeKeys([K_CONSENT_ERR]);
    return undefined;
  }
  return v.trim();
}

export async function setConsentLastError(message: string | undefined): Promise<void> {
  if (message === undefined || message === null || !message.trim()) {
    await removeKeys([K_CONSENT_ERR]);
    return;
  }
  await browser.storage.local.set({ [K_CONSENT_ERR]: message.trim() });
}

export type { DeviantArtCrossPostPackage, PatreonCrossPostPackage, XCrossPostPackage, PendingCrossPostPackage };

/** Backend-authorized package awaiting compose fill after background fetch. */
export async function getPendingCrossPost(): Promise<PatreonCrossPostPackage | undefined> {
  const r = await browser.storage.local.get(PENDING_CROSS_POST_STORAGE_KEY);
  const raw = r[PENDING_CROSS_POST_STORAGE_KEY];
  if (raw === undefined || raw === null) return undefined;
  try {
    return parsePatreonCrossPostPackage(raw);
  } catch (e) {
    await removeKeys([PENDING_CROSS_POST_STORAGE_KEY]);
    if (e instanceof CrossPostSchemaError) {
      throw new StorageSchemaError(e.message);
    }
    throw new StorageSchemaError("pending_cross_post: parse failed");
  }
}

export async function getPendingXCrossPost(): Promise<XCrossPostPackage | undefined> {
  const r = await browser.storage.local.get(PENDING_CROSS_POST_STORAGE_KEY);
  const raw = r[PENDING_CROSS_POST_STORAGE_KEY];
  if (raw === undefined || raw === null) return undefined;
  try {
    return parseXCrossPostPackage(raw);
  } catch (e) {
    await removeKeys([PENDING_CROSS_POST_STORAGE_KEY]);
    if (e instanceof CrossPostSchemaError) {
      throw new StorageSchemaError(e.message);
    }
    throw new StorageSchemaError("pending_cross_post: parse failed");
  }
}

export async function getPendingDeviantArtCrossPost(): Promise<
  DeviantArtCrossPostPackage | undefined
> {
  const r = await browser.storage.local.get(PENDING_CROSS_POST_STORAGE_KEY);
  const raw = r[PENDING_CROSS_POST_STORAGE_KEY];
  if (raw === undefined || raw === null) return undefined;
  try {
    return parseDeviantArtCrossPostPackage(raw);
  } catch (e) {
    await removeKeys([PENDING_CROSS_POST_STORAGE_KEY]);
    if (e instanceof CrossPostSchemaError) {
      throw new StorageSchemaError(e.message);
    }
    throw new StorageSchemaError("pending_cross_post: parse failed");
  }
}

function normalizePendingCrossPost(pkg: PendingCrossPostPackage): PendingCrossPostPackage {
  if ("post_text" in pkg && typeof pkg.post_text === "string") {
    return parseXCrossPostPackage(pkg);
  }
  if ("tags" in pkg && Array.isArray(pkg.tags)) {
    return parseDeviantArtCrossPostPackage(pkg);
  }
  return parsePatreonCrossPostPackage(pkg);
}

export async function setPendingCrossPost(
  pkg: PendingCrossPostPackage,
  attemptId?: string | null
): Promise<void> {
  const normalized = normalizePendingCrossPost(pkg);
  const payload: Record<string, unknown> = { [PENDING_CROSS_POST_STORAGE_KEY]: normalized };
  if (attemptId?.trim()) {
    payload.pending_cross_post_attempt_id = attemptId.trim();
  }
  await browser.storage.local.set(payload);
}

export async function getPendingCrossPostAttemptId(): Promise<string | null> {
  const raw = await browser.storage.local.get("pending_cross_post_attempt_id");
  const id = raw.pending_cross_post_attempt_id;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

export async function clearPendingCrossPost(): Promise<void> {
  await removeKeys([PENDING_CROSS_POST_STORAGE_KEY, "pending_cross_post_attempt_id"]);
}

export const PENDING_EXTERNAL_METRICS_SCRAPE_KEY = "pending_external_metrics_scrape" as const;

export type PendingExternalMetricsScrape = {
  /** Present for distribution-attempt metrics; may be empty when instance-scoped. */
  attempt_id: string;
  platform_instance_id?: string;
  post_id: string;
  destination: ExternalMetricsDestination;
  external_url: string;
};

function parsePendingExternalMetricsScrape(raw: unknown): PendingExternalMetricsScrape | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const attemptId = typeof o.attempt_id === "string" ? o.attempt_id.trim() : "";
  const platformInstanceId =
    typeof o.platform_instance_id === "string" ? o.platform_instance_id.trim() : "";
  const postId = typeof o.post_id === "string" ? o.post_id.trim() : "";
  const externalUrl = typeof o.external_url === "string" ? o.external_url.trim() : "";
  const destination = o.destination;
  if (
    (!attemptId && !platformInstanceId) ||
    !postId ||
    !externalUrl ||
    (destination !== "patreon" && destination !== "x" && destination !== "deviantart")
  ) {
    return null;
  }
  return {
    attempt_id: attemptId,
    ...(platformInstanceId ? { platform_instance_id: platformInstanceId } : {}),
    post_id: postId,
    destination,
    external_url: externalUrl
  };
}

export async function setPendingExternalMetricsScrape(
  context: PendingExternalMetricsScrape
): Promise<void> {
  const parsed = parsePendingExternalMetricsScrape(context);
  if (!parsed) {
    throw new StorageSchemaError("pending_external_metrics_scrape: invalid shape");
  }
  await browser.storage.local.set({ [PENDING_EXTERNAL_METRICS_SCRAPE_KEY]: parsed });
}

export async function getPendingExternalMetricsScrape(): Promise<PendingExternalMetricsScrape | null> {
  const raw = await browser.storage.local.get(PENDING_EXTERNAL_METRICS_SCRAPE_KEY);
  const parsed = parsePendingExternalMetricsScrape(raw[PENDING_EXTERNAL_METRICS_SCRAPE_KEY]);
  if (!parsed) {
    await removeKeys([PENDING_EXTERNAL_METRICS_SCRAPE_KEY]);
    return null;
  }
  return parsed;
}

export async function clearPendingExternalMetricsScrape(): Promise<void> {
  await removeKeys([PENDING_EXTERNAL_METRICS_SCRAPE_KEY]);
}
