/**
 * Relay Crosspost scoped tokens (EH-064).
 * Secrets hashed at rest in data/ — productionSafe remains false.
 */

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync
} from "node:fs";
import { join } from "node:path";

export const CROSSPOST_TOKEN_CONTRACT =
  "relay-crosspost-tokens/1.0.0" as const;

export const CROSSPOST_SCOPES = [
  "crosspost:draft",
  "crosspost:publish"
] as const;
export type CrosspostScope = (typeof CROSSPOST_SCOPES)[number];

export type CrosspostTokenRecord = {
  token_id: string;
  /** Public prefix for operator UI (never the full secret). */
  prefix: string;
  secret_hash: string;
  scopes: CrosspostScope[];
  label: string;
  created_at: string;
  revoked_at: string | null;
  expires_at: string | null;
};

export type CrosspostTokenDocument = {
  contract_version: typeof CROSSPOST_TOKEN_CONTRACT;
  site_id: string;
  production_safe: false;
  updated_at: string;
  tokens: CrosspostTokenRecord[];
};

function tokensPath(kitDir: string): string {
  return join(kitDir, "data", "relay-crosspost-tokens.json");
}

function hashSecret(secret: string, pepper = ""): string {
  return createHash("sha256")
    .update(`${pepper}:${secret}`)
    .digest("hex");
}

function safeEqualHex(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, "hex");
    const bb = Buffer.from(b, "hex");
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

export function emptyCrosspostTokenDoc(
  siteId: string
): CrosspostTokenDocument {
  return {
    contract_version: CROSSPOST_TOKEN_CONTRACT,
    site_id: siteId,
    production_safe: false,
    updated_at: new Date().toISOString(),
    tokens: []
  };
}

export function loadCrosspostTokens(
  siteId: string,
  kitDir = process.cwd()
): CrosspostTokenDocument {
  const path = tokensPath(kitDir);
  if (!existsSync(path)) return emptyCrosspostTokenDoc(siteId);
  try {
    const raw = JSON.parse(
      readFileSync(path, "utf8").replace(/^\uFEFF/, "")
    ) as Partial<CrosspostTokenDocument>;
    if (
      raw.contract_version !== CROSSPOST_TOKEN_CONTRACT ||
      !Array.isArray(raw.tokens)
    ) {
      return emptyCrosspostTokenDoc(siteId);
    }
    return {
      contract_version: CROSSPOST_TOKEN_CONTRACT,
      site_id: siteId,
      production_safe: false,
      updated_at:
        typeof raw.updated_at === "string"
          ? raw.updated_at
          : new Date().toISOString(),
      tokens: raw.tokens as CrosspostTokenRecord[]
    };
  } catch {
    return emptyCrosspostTokenDoc(siteId);
  }
}

export function saveCrosspostTokens(
  doc: CrosspostTokenDocument,
  kitDir = process.cwd()
): void {
  const normalized: CrosspostTokenDocument = {
    ...doc,
    contract_version: CROSSPOST_TOKEN_CONTRACT,
    production_safe: false,
    updated_at: new Date().toISOString()
  };
  mkdirSync(join(kitDir, "data"), { recursive: true });
  writeFileSync(
    tokensPath(kitDir),
    `${JSON.stringify(normalized, null, 2)}\n`,
    "utf8"
  );
}

export type MintCrosspostTokenInput = {
  siteId: string;
  scopes: CrosspostScope[];
  label?: string;
  expires_at?: string | null;
  pepper?: string;
  kitDir?: string;
};

export type MintCrosspostTokenResult =
  | {
      ok: true;
      /** Shown once — never persisted in plaintext. */
      secret: string;
      record: Omit<CrosspostTokenRecord, "secret_hash">;
    }
  | { ok: false; reason: string };

export function mintCrosspostToken(
  input: MintCrosspostTokenInput
): MintCrosspostTokenResult {
  const scopes = [
    ...new Set(
      input.scopes.filter((s): s is CrosspostScope =>
        (CROSSPOST_SCOPES as readonly string[]).includes(s)
      )
    )
  ];
  if (scopes.length === 0) return { ok: false, reason: "scopes_required" };

  let expires_at: string | null =
    input.expires_at === undefined ? null : input.expires_at;
  if (expires_at != null) {
    const ms = Date.parse(expires_at);
    if (!Number.isFinite(ms)) return { ok: false, reason: "invalid_expires_at" };
    expires_at = new Date(ms).toISOString();
  }

  const kitDir = input.kitDir ?? process.cwd();
  const doc = loadCrosspostTokens(input.siteId, kitDir);
  const raw = randomBytes(24).toString("hex");
  const secret = `ehxp_${raw}`;
  const prefix = secret.slice(0, 12);
  const token_id = `tok_${Date.now().toString(36)}_${randomBytes(3).toString("hex")}`;
  const record: CrosspostTokenRecord = {
    token_id,
    prefix,
    secret_hash: hashSecret(secret, input.pepper ?? ""),
    scopes,
    label: (input.label?.trim() || "Relay Crosspost").slice(0, 80),
    created_at: new Date().toISOString(),
    revoked_at: null,
    expires_at
  };
  doc.tokens = [record, ...doc.tokens];
  saveCrosspostTokens(doc, kitDir);
  const { secret_hash: _, ...publicRecord } = record;
  return { ok: true, secret, record: publicRecord };
}

export function revokeCrosspostToken(
  siteId: string,
  tokenId: string,
  kitDir = process.cwd()
): { ok: true; record: CrosspostTokenRecord } | { ok: false; reason: string } {
  const doc = loadCrosspostTokens(siteId, kitDir);
  const idx = doc.tokens.findIndex((t) => t.token_id === tokenId);
  if (idx < 0) return { ok: false, reason: "not_found" };
  const record: CrosspostTokenRecord = {
    ...doc.tokens[idx]!,
    revoked_at: new Date().toISOString()
  };
  doc.tokens[idx] = record;
  saveCrosspostTokens(doc, kitDir);
  return { ok: true, record };
}

export type AuthenticatedCrosspostToken = {
  token_id: string;
  scopes: CrosspostScope[];
  label: string;
};

export function authenticateCrosspostBearer(
  siteId: string,
  authorizationHeader: string | null,
  opts?: { pepper?: string; kitDir?: string; nowMs?: number }
):
  | { ok: true; token: AuthenticatedCrosspostToken }
  | { ok: false; reason: string; status: number } {
  if (!authorizationHeader || !authorizationHeader.startsWith("Bearer ")) {
    return { ok: false, reason: "missing_bearer", status: 401 };
  }
  const secret = authorizationHeader.slice("Bearer ".length).trim();
  if (!secret.startsWith("ehxp_")) {
    return { ok: false, reason: "invalid_token", status: 401 };
  }
  const kitDir = opts?.kitDir ?? process.cwd();
  const doc = loadCrosspostTokens(siteId, kitDir);
  const hash = hashSecret(secret, opts?.pepper ?? "");
  const nowMs = opts?.nowMs ?? Date.now();
  const match = doc.tokens.find((t) => safeEqualHex(t.secret_hash, hash));
  if (!match) return { ok: false, reason: "invalid_token", status: 401 };
  if (match.revoked_at) {
    return { ok: false, reason: "token_revoked", status: 401 };
  }
  if (match.expires_at && Date.parse(match.expires_at) < nowMs) {
    return { ok: false, reason: "token_expired", status: 401 };
  }
  return {
    ok: true,
    token: {
      token_id: match.token_id,
      scopes: [...match.scopes],
      label: match.label
    }
  };
}

export function tokenHasScope(
  token: AuthenticatedCrosspostToken,
  scope: CrosspostScope
): boolean {
  return token.scopes.includes(scope);
}

export function listCrosspostTokensPublic(
  siteId: string,
  kitDir = process.cwd()
): Array<Omit<CrosspostTokenRecord, "secret_hash">> {
  return loadCrosspostTokens(siteId, kitDir).tokens.map(
    ({ secret_hash: _, ...rest }) => rest
  );
}

export function activeCrosspostTokenCount(
  siteId: string,
  kitDir = process.cwd()
): number {
  const now = Date.now();
  return loadCrosspostTokens(siteId, kitDir).tokens.filter(
    (t) =>
      !t.revoked_at && (!t.expires_at || Date.parse(t.expires_at) >= now)
  ).length;
}
