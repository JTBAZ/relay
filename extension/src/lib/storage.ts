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
  generation: "credential_generation",
  credential: "credential_state",
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

export type CredentialContext = { grant: RelayGrant; installationId: string; binding: string };
export type CredentialState = {
  binding: string;
  observed_at: string | null;
  browser_session_present: boolean;
  acknowledged_at: string | null;
  uploaded_at: string | null;
  data_sync_at: string | null;
  hash: string | null;
  status: string;
};
export type CredentialStatus = Omit<CredentialState, "binding" | "hash">;
export async function getCredentialStatus(): Promise<CredentialStatus | null> {
  const state = await getCredentialState();
  if (!state) return null;
  const { binding: _binding, hash: _hash, ...status } = state;
  return status;
}

// All grant/binding/cache transitions share this queue; network work never holds it.
let credentialWrites: Promise<unknown> = Promise.resolve();
function credentialWrite<T>(operation: () => Promise<T>): Promise<T> {
  const next = credentialWrites.then(operation, operation);
  credentialWrites = next.catch(() => {});
  return next;
}
function contextFrom(raw: Record<string, unknown>): CredentialContext | undefined {
  if (!raw[K.grant] || !isNonEmptyString(raw[K.installationId]) || !isNonEmptyString(raw[K.generation])) return undefined;
  const grant = parseGrant(raw[K.grant]);
  const installationId = (raw[K.installationId] as string).trim();
  return { grant, installationId, binding: JSON.stringify([installationId, grant.token_id, grant.account_id, grant.relay_creator_id, raw[K.generation]]) };
}
export async function getCredentialContext(): Promise<CredentialContext | undefined> {
  return credentialWrite(async () => {
    const raw = await browser.storage.local.get([K.grant, K.installationId, K.generation]);
    if (raw[K.grant] && isNonEmptyString(raw[K.installationId]) && !isNonEmptyString(raw[K.generation])) {
      parseGrant(raw[K.grant]);
      raw[K.generation] = crypto.randomUUID();
      await browser.storage.local.set({ [K.generation]: raw[K.generation] });
      await removeKeys([K.credential, K.lastSyncAt, K.lastSyncHash, K.lastSyncStatus]);
    }
    return contextFrom(raw);
  });
}
export async function getCredentialState(): Promise<CredentialState | undefined> {
  const raw = await browser.storage.local.get([K.grant, K.installationId, K.generation, K.credential]);
  const context = contextFrom(raw), value = raw[K.credential] as CredentialState | undefined;
  return context && value?.binding === context.binding ? value : undefined;
}
export async function updateCredentialState(context: CredentialContext, patch: Partial<Omit<CredentialState, "binding">>): Promise<boolean> {
  return credentialWrite(async () => {
    const current = contextFrom(await browser.storage.local.get([K.grant, K.installationId, K.generation]));
    if (!current || current.binding !== context.binding) return false;
    const prior = await getCredentialState();
    await browser.storage.local.set({ [K.credential]: {
      observed_at: null, browser_session_present: false, acknowledged_at: null,
      uploaded_at: null, data_sync_at: null, hash: null, status: "unknown",
      ...prior, ...patch, binding: context.binding
    } });
    return true;
  });
}
export async function clearGrantIfCurrent(context: CredentialContext): Promise<boolean> {
  return credentialWrite(async () => {
    if (contextFrom(await browser.storage.local.get([K.grant, K.installationId, K.generation]))?.binding !== context.binding) return false;
    await removeKeys([K.grant, K.credential, K.generation, K.lastSyncAt, K.lastSyncHash, K.lastSyncStatus]);
    return true;
  });
}

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
  await credentialWrite(async () => {
    await browser.storage.local.set({ [K.installationId]: t, [K.generation]: crypto.randomUUID() });
    await removeKeys([K.credential]);
  });
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

export async function setGrant(grant: RelayGrant, stillCurrent: () => boolean = () => true): Promise<boolean> {
  const g = parseGrant(grant);
  return credentialWrite(async () => {
    if (!stillCurrent()) return false;
    await browser.storage.local.set({ [K.grant]: g, [K.generation]: crypto.randomUUID() });
    await removeKeys([K.credential, K.lastSyncAt, K.lastSyncHash, K.lastSyncStatus]);
    return true;
  });
}

export async function clearGrant(): Promise<void> {
  await credentialWrite(() => removeKeys([K.grant, K.credential, K.generation, K.lastSyncAt, K.lastSyncHash, K.lastSyncStatus]));
}

export async function getLastSync(): Promise<LastSync | undefined> {
  const state = await getCredentialState();
  return state?.acknowledged_at ? { at: state.acknowledged_at, hash: state.hash ?? "", status: state.status } : undefined;
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
