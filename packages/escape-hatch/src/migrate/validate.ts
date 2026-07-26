/**
 * Fail-closed parsers for EH-012 media migration documents.
 * Errors expose field paths only — never payload dumps or credentials.
 */

import {
  ContractValidationError,
  type ContractIssue
} from "../contracts.js";
import {
  MEDIA_MIGRATION_LEDGER_CONTRACT_VERSION,
  MEDIA_MIGRATION_REPORT_CONTRACT_VERSION,
  MIGRATION_ACCESS_CLASSES,
  MIGRATION_NEXT_ACTIONS,
  MIGRATION_OBJECT_STATUSES,
  type MediaMigrationLedger,
  type MediaMigrationObjectEntry,
  type MediaMigrationReport,
  type MigrationAccessClass,
  type MigrationNextAction,
  type MigrationObjectStatus
} from "./types.js";

const DANGEROUS_KEYS = new Set(["__proto__", "prototype", "constructor"]);

function issue(fieldPath: string, message: string, code = "invalid"): ContractIssue {
  return { fieldPath, message, code };
}

function throwIssues(issues: ContractIssue[]): never {
  const first = issues[0];
  const err = new ContractValidationError(
    first?.fieldPath ?? "(root)",
    first?.message ?? "validation failed",
    first?.code ?? "invalid"
  );
  (err as ContractValidationError & { issues: ContractIssue[] }).issues = issues;
  throw err;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function ownGet(obj: Record<string, unknown>, key: string): unknown {
  if (DANGEROUS_KEYS.has(key)) return undefined;
  if (!Object.prototype.hasOwnProperty.call(obj, key)) return undefined;
  return obj[key];
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isSafeId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 256 &&
    /^[A-Za-z0-9_.:-]+$/.test(value) &&
    value !== "." &&
    !value.includes("..")
  );
}

function isIsoDateTime(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.exec(
      value
    );
  if (!match || !Number.isFinite(Date.parse(value))) return false;
  return true;
}

function isSha256Hex(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
}

function isFiniteNonNegInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function parseObjectEntry(
  input: unknown,
  path: string,
  issues: ContractIssue[]
): MediaMigrationObjectEntry | null {
  if (!isPlainObject(input)) {
    issues.push(issue(path, "expected object", "type"));
    return null;
  }
  const media_id = ownGet(input, "media_id");
  const status = ownGet(input, "status");
  const attempt_count = ownGet(input, "attempt_count");
  const access_class = ownGet(input, "access_class");
  const private_required = ownGet(input, "private_required");
  const private_read_verified = ownGet(input, "private_read_verified");
  const next_action = ownGet(input, "next_action");

  if (!isSafeId(media_id)) {
    issues.push(issue(`${path}.media_id`, "expected safe id", "type"));
  }
  if (
    typeof status !== "string" ||
    !(MIGRATION_OBJECT_STATUSES as readonly string[]).includes(status)
  ) {
    issues.push(issue(`${path}.status`, "unsupported status", "type"));
  }
  if (!isFiniteNonNegInt(attempt_count)) {
    issues.push(issue(`${path}.attempt_count`, "expected non-negative integer", "type"));
  }
  if (
    typeof access_class !== "string" ||
    !(MIGRATION_ACCESS_CLASSES as readonly string[]).includes(access_class)
  ) {
    issues.push(issue(`${path}.access_class`, "unsupported access_class", "type"));
  }
  if (typeof private_required !== "boolean") {
    issues.push(issue(`${path}.private_required`, "expected boolean", "type"));
  }
  if (typeof private_read_verified !== "boolean") {
    issues.push(issue(`${path}.private_read_verified`, "expected boolean", "type"));
  }
  if (
    typeof next_action !== "string" ||
    !(MIGRATION_NEXT_ACTIONS as readonly string[]).includes(next_action)
  ) {
    issues.push(issue(`${path}.next_action`, "unsupported next_action", "type"));
  }

  if (issues.some((i) => i.fieldPath.startsWith(path))) {
    return null;
  }

  const entry: MediaMigrationObjectEntry = {
    media_id: media_id as string,
    status: status as MigrationObjectStatus,
    attempt_count: attempt_count as number,
    access_class: access_class as MigrationAccessClass,
    private_required: private_required as boolean,
    private_read_verified: private_read_verified as boolean,
    next_action: next_action as MigrationNextAction
  };

  const object_key = ownGet(input, "object_key");
  if (object_key !== undefined) {
    if (!isNonEmptyString(object_key) || object_key.includes("..")) {
      issues.push(issue(`${path}.object_key`, "invalid object key", "type"));
    } else if (isPublicMediaPath(object_key)) {
      issues.push(
        issue(
          `${path}.object_key`,
          "public/media paths are not private object keys",
          "security"
        )
      );
    } else {
      entry.object_key = object_key;
    }
  }

  const source_relative_path = ownGet(input, "source_relative_path");
  if (source_relative_path !== undefined) {
    if (!isNonEmptyString(source_relative_path)) {
      issues.push(issue(`${path}.source_relative_path`, "expected string", "type"));
    } else {
      entry.source_relative_path = source_relative_path;
    }
  }

  for (const field of ["expected_sha256", "actual_sha256"] as const) {
    const v = ownGet(input, field);
    if (v !== undefined) {
      if (!isSha256Hex(v)) {
        issues.push(issue(`${path}.${field}`, "expected sha256 hex", "format"));
      } else {
        entry[field] = v.toLowerCase();
      }
    }
  }

  for (const field of ["expected_byte_length", "actual_byte_length"] as const) {
    const v = ownGet(input, field);
    if (v !== undefined) {
      if (!isFiniteNonNegInt(v)) {
        issues.push(issue(`${path}.${field}`, "expected non-negative integer", "type"));
      } else {
        entry[field] = v;
      }
    }
  }

  const mime_type = ownGet(input, "mime_type");
  if (mime_type !== undefined) {
    if (!isNonEmptyString(mime_type) || mime_type.length > 200) {
      issues.push(issue(`${path}.mime_type`, "invalid mime", "type"));
    } else {
      entry.mime_type = mime_type;
    }
  }

  const original_filename = ownGet(input, "original_filename");
  if (original_filename !== undefined) {
    if (!isNonEmptyString(original_filename) || original_filename.includes("..")) {
      issues.push(issue(`${path}.original_filename`, "invalid filename", "type"));
    } else {
      entry.original_filename = original_filename;
    }
  }

  const failure_reason = ownGet(input, "failure_reason");
  if (failure_reason !== undefined) {
    if (typeof failure_reason !== "string") {
      issues.push(issue(`${path}.failure_reason`, "expected string", "type"));
    } else {
      entry.failure_reason = failure_reason;
    }
  }

  const last_attempt_at = ownGet(input, "last_attempt_at");
  if (last_attempt_at !== undefined) {
    if (!isIsoDateTime(last_attempt_at)) {
      issues.push(issue(`${path}.last_attempt_at`, "expected ISO date-time", "format"));
    } else {
      entry.last_attempt_at = last_attempt_at;
    }
  }

  return entry;
}

/** True when a path looks like prototype public/media delivery (never private). */
export function isPublicMediaPath(value: string): boolean {
  const n = value.replace(/\\/g, "/").toLowerCase();
  return (
    n === "public/media" ||
    n.startsWith("public/media/") ||
    n.includes("/public/media/") ||
    n.startsWith("/media/") ||
    /^media\/[^/]+$/.test(n)
  );
}

/**
 * Fail-closed: refuse public/media or guessable sequential paths as private keys.
 */
export function assertPrivateObjectKey(objectKey: string): void {
  if (!objectKey || typeof objectKey !== "string") {
    throw new Error("object key required");
  }
  if (objectKey.includes("..") || objectKey.includes("\0")) {
    throw new Error("unsafe object key");
  }
  const normalized = objectKey.replace(/\\/g, "/");
  // Guessable sequential public-style keys (media/1, media/2, …)
  if (/^media\/\d+(\/|$)/i.test(normalized)) {
    throw new Error("guessable sequential media key rejected");
  }
  if (isPublicMediaPath(objectKey)) {
    throw new Error(
      "public/media path is not private-read verification (prototype leakage only)"
    );
  }
}

export function parseMediaMigrationLedger(input: unknown): MediaMigrationLedger {
  const issues: ContractIssue[] = [];
  if (!isPlainObject(input)) {
    throwIssues([issue("(root)", "expected object", "type")]);
  }
  const version = ownGet(input, "contract_version");
  if (version !== MEDIA_MIGRATION_LEDGER_CONTRACT_VERSION) {
    issues.push(
      issue(
        "contract_version",
        `unsupported version; expected ${MEDIA_MIGRATION_LEDGER_CONTRACT_VERSION}`,
        "unsupported_version"
      )
    );
  }
  const site_id = ownGet(input, "site_id");
  const creator_id = ownGet(input, "creator_id");
  const batch_id = ownGet(input, "batch_id");
  const updated_at = ownGet(input, "updated_at");
  const production_safe = ownGet(input, "production_safe");
  if (!isSafeId(site_id)) issues.push(issue("site_id", "expected safe id", "type"));
  if (!isSafeId(creator_id)) issues.push(issue("creator_id", "expected safe id", "type"));
  if (!isNonEmptyString(batch_id)) issues.push(issue("batch_id", "expected string", "type"));
  if (!isIsoDateTime(updated_at)) {
    issues.push(issue("updated_at", "expected ISO date-time", "format"));
  }
  if (production_safe !== false) {
    issues.push(issue("production_safe", "must be false", "security"));
  }

  const notesRaw = ownGet(input, "notes");
  const notes = Array.isArray(notesRaw)
    ? notesRaw.filter((n): n is string => typeof n === "string")
    : [];

  const objectsRaw = ownGet(input, "objects");
  if (!isPlainObject(objectsRaw)) {
    issues.push(issue("objects", "expected object", "type"));
  }
  if (issues.length > 0) throwIssues(issues);

  const objects: Record<string, MediaMigrationObjectEntry> = Object.create(null);
  for (const key of Object.keys(objectsRaw as Record<string, unknown>)) {
    if (DANGEROUS_KEYS.has(key)) continue;
    if (!isSafeId(key)) {
      issues.push(issue(`objects.${key}`, "unsafe media id key", "type"));
      continue;
    }
    const entry = parseObjectEntry(
      ownGet(objectsRaw as Record<string, unknown>, key),
      `objects.${key}`,
      issues
    );
    if (entry) {
      if (entry.media_id !== key) {
        issues.push(
          issue(`objects.${key}.media_id`, "must match object map key", "invalid")
        );
      } else {
        objects[key] = entry;
      }
    }
  }
  if (issues.length > 0) throwIssues(issues);

  return {
    contract_version: MEDIA_MIGRATION_LEDGER_CONTRACT_VERSION,
    site_id: site_id as string,
    creator_id: creator_id as string,
    batch_id: batch_id as string,
    updated_at: updated_at as string,
    production_safe: false,
    notes,
    objects
  };
}

export function parseMediaMigrationReport(input: unknown): MediaMigrationReport {
  const issues: ContractIssue[] = [];
  if (!isPlainObject(input)) {
    throwIssues([issue("(root)", "expected object", "type")]);
  }
  const version = ownGet(input, "contract_version");
  if (version !== MEDIA_MIGRATION_REPORT_CONTRACT_VERSION) {
    issues.push(
      issue(
        "contract_version",
        `unsupported version; expected ${MEDIA_MIGRATION_REPORT_CONTRACT_VERSION}`,
        "unsupported_version"
      )
    );
  }
  const site_id = ownGet(input, "site_id");
  const creator_id = ownGet(input, "creator_id");
  const batch_id = ownGet(input, "batch_id");
  const generated_at = ownGet(input, "generated_at");
  const production_safe = ownGet(input, "production_safe");
  if (!isSafeId(site_id)) issues.push(issue("site_id", "expected safe id", "type"));
  if (!isSafeId(creator_id)) issues.push(issue("creator_id", "expected safe id", "type"));
  if (!isNonEmptyString(batch_id)) issues.push(issue("batch_id", "expected string", "type"));
  if (!isIsoDateTime(generated_at)) {
    issues.push(issue("generated_at", "expected ISO date-time", "format"));
  }
  if (production_safe !== false) {
    issues.push(issue("production_safe", "must be false", "security"));
  }

  const counts = [
    "expected",
    "copied",
    "verified",
    "failed",
    "skipped",
    "bytes_verified"
  ] as const;
  const nums: Record<(typeof counts)[number], number> = {
    expected: 0,
    copied: 0,
    verified: 0,
    failed: 0,
    skipped: 0,
    bytes_verified: 0
  };
  for (const k of counts) {
    const v = ownGet(input, k);
    if (!isFiniteNonNegInt(v)) {
      issues.push(issue(k, "expected non-negative integer", "type"));
    } else {
      nums[k] = v;
    }
  }

  const notesRaw = ownGet(input, "notes");
  const notes = Array.isArray(notesRaw)
    ? notesRaw.filter((n): n is string => typeof n === "string")
    : [];

  if (issues.length > 0) throwIssues(issues);

  return {
    contract_version: MEDIA_MIGRATION_REPORT_CONTRACT_VERSION,
    site_id: site_id as string,
    creator_id: creator_id as string,
    batch_id: batch_id as string,
    generated_at: generated_at as string,
    production_safe: false,
    ...nums,
    notes
  };
}

export function serializeMigrationDocument(doc: unknown): string {
  return `${JSON.stringify(doc, null, 2)}\n`;
}

/** Reject serialized ledgers/reports that embed credential-shaped material. */
export function assertNoSecretsInMigrationJson(json: string): void {
  const lower = json.toLowerCase();
  if (lower.includes("secretaccesskey") || lower.includes("accesskeyid")) {
    throw new Error("migration document must not embed storage credentials");
  }
  if (/sk_(live|test)_/i.test(json)) {
    throw new Error("migration document must not embed stripe-like secrets");
  }
  if (/-----begin (rsa |ec |openssh )?private key-----/i.test(json)) {
    throw new Error("migration document must not embed private keys");
  }
  if (/\bBearer\s+[A-Za-z0-9\-._~+/]+=*/i.test(json)) {
    throw new Error("migration document must not embed bearer tokens");
  }
  // Signed URL query secrets
  if (/[?&]x-amz-signature=/i.test(json) || /[?&]x-amz-credential=/i.test(json)) {
    throw new Error("migration document must not embed signed URL credentials");
  }
}
