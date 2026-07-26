/**
 * Crosspost audit + idempotency store (EH-064).
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync
} from "node:fs";
import { join } from "node:path";

export const CROSSPOST_AUDIT_CONTRACT =
  "relay-crosspost-audit/1.0.0" as const;

export type CrosspostAuditEntry = {
  entry_id: string;
  token_id: string;
  action: "draft" | "publish";
  post_id: string | null;
  idempotency_key: string | null;
  ok: boolean;
  detail: string;
  created_at: string;
};

export type CrosspostIdempotencyRecord = {
  key: string;
  token_id: string;
  response_status: number;
  response_body: unknown;
  created_at: string;
};

export type CrosspostAuditDocument = {
  contract_version: typeof CROSSPOST_AUDIT_CONTRACT;
  site_id: string;
  production_safe: false;
  updated_at: string;
  entries: CrosspostAuditEntry[];
  idempotency: CrosspostIdempotencyRecord[];
};

function auditPath(kitDir: string): string {
  return join(kitDir, "data", "relay-crosspost-audit.json");
}

export function emptyCrosspostAudit(siteId: string): CrosspostAuditDocument {
  return {
    contract_version: CROSSPOST_AUDIT_CONTRACT,
    site_id: siteId,
    production_safe: false,
    updated_at: new Date().toISOString(),
    entries: [],
    idempotency: []
  };
}

export function loadCrosspostAudit(
  siteId: string,
  kitDir = process.cwd()
): CrosspostAuditDocument {
  const path = auditPath(kitDir);
  if (!existsSync(path)) return emptyCrosspostAudit(siteId);
  try {
    const raw = JSON.parse(
      readFileSync(path, "utf8").replace(/^\uFEFF/, "")
    ) as Partial<CrosspostAuditDocument>;
    if (
      raw.contract_version !== CROSSPOST_AUDIT_CONTRACT ||
      !Array.isArray(raw.entries) ||
      !Array.isArray(raw.idempotency)
    ) {
      return emptyCrosspostAudit(siteId);
    }
    return {
      contract_version: CROSSPOST_AUDIT_CONTRACT,
      site_id: siteId,
      production_safe: false,
      updated_at:
        typeof raw.updated_at === "string"
          ? raw.updated_at
          : new Date().toISOString(),
      entries: raw.entries as CrosspostAuditEntry[],
      idempotency: raw.idempotency as CrosspostIdempotencyRecord[]
    };
  } catch {
    return emptyCrosspostAudit(siteId);
  }
}

export function saveCrosspostAudit(
  doc: CrosspostAuditDocument,
  kitDir = process.cwd()
): void {
  const normalized: CrosspostAuditDocument = {
    ...doc,
    contract_version: CROSSPOST_AUDIT_CONTRACT,
    production_safe: false,
    updated_at: new Date().toISOString(),
    entries: doc.entries.slice(0, 500),
    idempotency: doc.idempotency.slice(0, 200)
  };
  mkdirSync(join(kitDir, "data"), { recursive: true });
  writeFileSync(
    auditPath(kitDir),
    `${JSON.stringify(normalized, null, 2)}\n`,
    "utf8"
  );
}

export function appendCrosspostAudit(
  siteId: string,
  entry: Omit<CrosspostAuditEntry, "entry_id" | "created_at">,
  kitDir = process.cwd()
): void {
  const doc = loadCrosspostAudit(siteId, kitDir);
  doc.entries.unshift({
    ...entry,
    entry_id: `aud_${Date.now().toString(36)}_${Math.random()
      .toString(36)
      .slice(2, 6)}`,
    created_at: new Date().toISOString()
  });
  saveCrosspostAudit(doc, kitDir);
}

export function findIdempotentResponse(
  siteId: string,
  tokenId: string,
  key: string,
  kitDir = process.cwd()
): CrosspostIdempotencyRecord | null {
  const doc = loadCrosspostAudit(siteId, kitDir);
  return (
    doc.idempotency.find(
      (r) => r.key === key && r.token_id === tokenId
    ) ?? null
  );
}

export function storeIdempotentResponse(
  siteId: string,
  record: CrosspostIdempotencyRecord,
  kitDir = process.cwd()
): void {
  const doc = loadCrosspostAudit(siteId, kitDir);
  doc.idempotency = [
    record,
    ...doc.idempotency.filter(
      (r) => !(r.key === record.key && r.token_id === record.token_id)
    )
  ];
  saveCrosspostAudit(doc, kitDir);
}
