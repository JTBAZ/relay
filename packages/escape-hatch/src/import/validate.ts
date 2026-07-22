/**
 * Fail-closed parsers for EH-011 import documents and minimal canonical shapes.
 * Errors expose field paths only — never payload dumps.
 */

import {
  ACCESS_LEVELS,
  ContractValidationError,
  isSafeRouteSegment,
  type AccessLevel,
  type ContractIssue,
  type TierMatchMode,
  TIER_MATCH_MODES
} from "../contracts.js";
import { isSafeRelativeBlobPath } from "./path-safety.js";
import {
  CONFLICT_KINDS,
  EXCLUSION_KINDS,
  IMPORT_LOCAL_STATE_CONTRACT_VERSION,
  IMPORT_ORIGINS,
  IMPORT_PROVENANCE_CONTRACT_VERSION,
  IMPORT_REPORT_CONTRACT_VERSION,
  type AccountedItem,
  type ConflictItem,
  type ExclusionKind,
  type ImportLocalState,
  type ImportOrigin,
  type ImportProvenance,
  type ImportReport,
  type LocalPostState,
  type ProvenanceAccessSnapshot,
  type ProvenanceMediaEntry,
  type ProvenancePostEntry,
  type ProvenanceTierEntry,
  type ReplayLedger
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
  const [, year, month, day, hour, minute, second] = match;
  const y = Number(year);
  const mo = Number(month);
  const d = Number(day);
  const h = Number(hour);
  const mi = Number(minute);
  const s = Number(second);
  if (h > 23 || mi > 59 || s > 59) return false;
  const calendar = new Date(Date.UTC(y, mo - 1, d));
  return (
    calendar.getUTCFullYear() === y &&
    calendar.getUTCMonth() === mo - 1 &&
    calendar.getUTCDate() === d
  );
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function expectStringArray(
  value: unknown,
  path: string,
  issues: ContractIssue[]
): string[] {
  if (!Array.isArray(value)) {
    issues.push(issue(path, "expected an array of strings", "type"));
    return [];
  }
  const out: string[] = [];
  for (let i = 0; i < value.length; i++) {
    const item = value[i];
    if (typeof item !== "string") {
      issues.push(issue(`${path}[${i}]`, "expected string", "type"));
      continue;
    }
    out.push(item);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Minimal canonical snapshot (creator-scoped validation)
// ---------------------------------------------------------------------------

export type CanonicalPostVersion = {
  version_seq: number;
  upstream_revision: string;
  title: string;
  published_at: string;
  tag_ids: string[];
  tier_ids: string[];
  media_ids: string[];
  ingested_at: string;
  is_mature?: boolean;
  legal_adult?: boolean;
  content_flags?: string[];
};

export type CanonicalPostRow = {
  post_id: string;
  creator_id: string;
  upstream_status: "active" | "deleted";
  current: CanonicalPostVersion | null;
};

export type CanonicalMediaRow = {
  media_id: string;
  creator_id: string;
  post_ids: string[];
  upstream_status: "active" | "deleted";
  current: {
    version_seq: number;
    upstream_revision: string;
    mime_type?: string;
    ingested_at: string;
  } | null;
};

export type CanonicalTierRow = {
  tier_id: string;
  creator_id: string;
  campaign_id?: string;
  title: string;
  amount_cents?: number;
  upstream_updated_at: string;
  version_seq: number;
};

export type ValidatedCanonicalSlice = {
  creator_id: string;
  /** Raw snapshot object for Relay clone-generator (never mutated). */
  raw: unknown;
  posts: Record<string, CanonicalPostRow>;
  media: Record<string, CanonicalMediaRow>;
  tiers: Record<string, CanonicalTierRow>;
};

function parsePostVersion(
  value: unknown,
  path: string,
  issues: ContractIssue[],
  allowNull: boolean
): CanonicalPostVersion | null {
  if (value === null) {
    if (!allowNull) {
      issues.push(issue(path, "expected object", "type"));
    }
    return null;
  }
  if (!isPlainObject(value)) {
    issues.push(issue(path, "expected object", "type"));
    return null;
  }
  const version_seq = ownGet(value, "version_seq");
  const upstream_revision = ownGet(value, "upstream_revision");
  const title = ownGet(value, "title");
  const published_at = ownGet(value, "published_at");
  const ingested_at = ownGet(value, "ingested_at");
  if (!isFiniteNumber(version_seq) || !Number.isInteger(version_seq) || version_seq < 0) {
    issues.push(issue(`${path}.version_seq`, "expected non-negative integer", "type"));
  }
  if (!isNonEmptyString(upstream_revision)) {
    issues.push(issue(`${path}.upstream_revision`, "expected non-empty string", "type"));
  }
  if (!isNonEmptyString(title)) {
    issues.push(issue(`${path}.title`, "expected non-empty string", "type"));
  }
  if (!isIsoDateTime(published_at)) {
    issues.push(issue(`${path}.published_at`, "expected valid ISO date-time", "format"));
  }
  if (!isIsoDateTime(ingested_at)) {
    issues.push(issue(`${path}.ingested_at`, "expected valid ISO date-time", "format"));
  }
  const tag_ids = expectStringArray(ownGet(value, "tag_ids"), `${path}.tag_ids`, issues);
  const tier_ids = expectStringArray(ownGet(value, "tier_ids"), `${path}.tier_ids`, issues);
  const media_ids = expectStringArray(ownGet(value, "media_ids"), `${path}.media_ids`, issues);

  const is_mature = ownGet(value, "is_mature");
  const legal_adult = ownGet(value, "legal_adult");
  const content_flags = ownGet(value, "content_flags");
  if (is_mature !== undefined && typeof is_mature !== "boolean") {
    issues.push(issue(`${path}.is_mature`, "expected boolean when present", "type"));
  }
  if (legal_adult !== undefined && typeof legal_adult !== "boolean") {
    issues.push(issue(`${path}.legal_adult`, "expected boolean when present", "type"));
  }
  let flags: string[] | undefined;
  if (content_flags !== undefined) {
    flags = expectStringArray(content_flags, `${path}.content_flags`, issues);
  }

  if (
    !isFiniteNumber(version_seq) ||
    !isNonEmptyString(upstream_revision) ||
    !isNonEmptyString(title) ||
    !isIsoDateTime(published_at) ||
    !isIsoDateTime(ingested_at)
  ) {
    return null;
  }

  const out: CanonicalPostVersion = {
    version_seq,
    upstream_revision,
    title,
    published_at,
    tag_ids: [...tag_ids],
    tier_ids: [...tier_ids],
    media_ids: [...media_ids],
    ingested_at
  };
  if (typeof is_mature === "boolean") out.is_mature = is_mature;
  if (typeof legal_adult === "boolean") out.legal_adult = legal_adult;
  if (flags) out.content_flags = flags;
  return out;
}

/**
 * Validate creator-scoped canonical fields needed by the importer.
 * Accepts legacy `idempotency` key alongside `ingest_idempotency`.
 */
export function parseCanonicalForImport(
  input: unknown,
  creatorId: string
): ValidatedCanonicalSlice {
  const issues: ContractIssue[] = [];
  if (!isSafeId(creatorId)) {
    throwIssues([issue("creator_id", "expected non-empty safe id string", "type")]);
  }
  if (!isPlainObject(input)) {
    throwIssues([issue("(root)", "expected object", "type")]);
  }

  const postsRoot = ownGet(input, "posts");
  const mediaRoot = ownGet(input, "media");
  const tiersRoot = ownGet(input, "tiers");
  if (!isPlainObject(postsRoot)) {
    issues.push(issue("posts", "expected object", "type"));
  }
  if (!isPlainObject(mediaRoot)) {
    issues.push(issue("media", "expected object", "type"));
  }
  if (!isPlainObject(tiersRoot)) {
    issues.push(issue("tiers", "expected object", "type"));
  }

  const creatorPosts =
    isPlainObject(postsRoot) && isPlainObject(ownGet(postsRoot, creatorId) as object)
      ? (ownGet(postsRoot as Record<string, unknown>, creatorId) as Record<string, unknown>)
      : null;
  const creatorMedia =
    isPlainObject(mediaRoot) && isPlainObject(ownGet(mediaRoot, creatorId) as object)
      ? (ownGet(mediaRoot as Record<string, unknown>, creatorId) as Record<string, unknown>)
      : null;
  const creatorTiers =
    isPlainObject(tiersRoot) && isPlainObject(ownGet(tiersRoot, creatorId) as object)
      ? (ownGet(tiersRoot as Record<string, unknown>, creatorId) as Record<string, unknown>)
      : null;

  if (isPlainObject(postsRoot) && !creatorPosts) {
    issues.push(
      issue(`posts.${creatorId}`, "expected creator post map object", "required")
    );
  }
  if (isPlainObject(mediaRoot) && !creatorMedia) {
    issues.push(
      issue(`media.${creatorId}`, "expected creator media map object", "required")
    );
  }
  if (isPlainObject(tiersRoot) && !creatorTiers) {
    issues.push(
      issue(`tiers.${creatorId}`, "expected creator tier map object", "required")
    );
  }

  const posts: Record<string, CanonicalPostRow> = Object.create(null);
  if (creatorPosts) {
    for (const postId of Object.keys(creatorPosts)) {
      if (DANGEROUS_KEYS.has(postId)) continue;
      const path = `posts.${creatorId}.${postId}`;
      const raw = ownGet(creatorPosts, postId);
      if (!isPlainObject(raw)) {
        issues.push(issue(path, "expected object", "type"));
        continue;
      }
      const post_id = ownGet(raw, "post_id");
      const creator_id = ownGet(raw, "creator_id");
      const upstream_status = ownGet(raw, "upstream_status");
      if (!isSafeId(post_id)) {
        issues.push(issue(`${path}.post_id`, "expected non-empty safe id string", "type"));
      }
      if (creator_id !== creatorId) {
        issues.push(
          issue(`${path}.creator_id`, "must match import creator_id", "reference")
        );
      }
      if (upstream_status !== "active" && upstream_status !== "deleted") {
        issues.push(
          issue(`${path}.upstream_status`, 'expected "active" or "deleted"', "enum")
        );
      }
      const allowNullCurrent = upstream_status === "deleted";
      const current = parsePostVersion(
        ownGet(raw, "current"),
        `${path}.current`,
        issues,
        allowNullCurrent
      );
      if (upstream_status === "active" && !current) {
        issues.push(issue(`${path}.current`, "active posts require current version", "required"));
      }
      if (
        isSafeId(post_id) &&
        (upstream_status === "active" || upstream_status === "deleted")
      ) {
        posts[post_id] = {
          post_id,
          creator_id: creatorId,
          upstream_status,
          current
        };
      }
    }
  }

  const media: Record<string, CanonicalMediaRow> = Object.create(null);
  if (creatorMedia) {
    for (const mediaId of Object.keys(creatorMedia)) {
      if (DANGEROUS_KEYS.has(mediaId)) continue;
      const path = `media.${creatorId}.${mediaId}`;
      const raw = ownGet(creatorMedia, mediaId);
      if (!isPlainObject(raw)) {
        issues.push(issue(path, "expected object", "type"));
        continue;
      }
      const media_id = ownGet(raw, "media_id");
      const creator_id = ownGet(raw, "creator_id");
      const upstream_status = ownGet(raw, "upstream_status");
      const post_ids = expectStringArray(ownGet(raw, "post_ids"), `${path}.post_ids`, issues);
      if (!isSafeId(media_id)) {
        issues.push(issue(`${path}.media_id`, "expected non-empty safe id string", "type"));
      }
      if (creator_id !== creatorId) {
        issues.push(
          issue(`${path}.creator_id`, "must match import creator_id", "reference")
        );
      }
      if (upstream_status !== "active" && upstream_status !== "deleted") {
        issues.push(
          issue(`${path}.upstream_status`, 'expected "active" or "deleted"', "enum")
        );
      }
      const currentRaw = ownGet(raw, "current");
      let current: CanonicalMediaRow["current"] = null;
      if (currentRaw === null && upstream_status === "deleted") {
        current = null;
      } else if (!isPlainObject(currentRaw)) {
        issues.push(issue(`${path}.current`, "expected object", "type"));
      } else {
        const version_seq = ownGet(currentRaw, "version_seq");
        const upstream_revision = ownGet(currentRaw, "upstream_revision");
        const ingested_at = ownGet(currentRaw, "ingested_at");
        const mime_type = ownGet(currentRaw, "mime_type");
        if (!isFiniteNumber(version_seq) || !Number.isInteger(version_seq)) {
          issues.push(issue(`${path}.current.version_seq`, "expected integer", "type"));
        }
        if (!isNonEmptyString(upstream_revision)) {
          issues.push(
            issue(`${path}.current.upstream_revision`, "expected non-empty string", "type")
          );
        }
        if (!isIsoDateTime(ingested_at)) {
          issues.push(
            issue(`${path}.current.ingested_at`, "expected valid ISO date-time", "format")
          );
        }
        if (mime_type !== undefined && !isNonEmptyString(mime_type)) {
          issues.push(
            issue(`${path}.current.mime_type`, "expected non-empty string when present", "type")
          );
        }
        if (
          isFiniteNumber(version_seq) &&
          isNonEmptyString(upstream_revision) &&
          isIsoDateTime(ingested_at)
        ) {
          current = {
            version_seq,
            upstream_revision,
            ingested_at
          };
          if (typeof mime_type === "string") current.mime_type = mime_type;
        }
      }
      if (
        isSafeId(media_id) &&
        (upstream_status === "active" || upstream_status === "deleted")
      ) {
        media[media_id] = {
          media_id,
          creator_id: creatorId,
          post_ids: [...post_ids],
          upstream_status,
          current
        };
      }
    }
  }

  const tiers: Record<string, CanonicalTierRow> = Object.create(null);
  if (creatorTiers) {
    for (const tierId of Object.keys(creatorTiers)) {
      if (DANGEROUS_KEYS.has(tierId)) continue;
      const path = `tiers.${creatorId}.${tierId}`;
      const raw = ownGet(creatorTiers, tierId);
      if (!isPlainObject(raw)) {
        issues.push(issue(path, "expected object", "type"));
        continue;
      }
      const tier_id = ownGet(raw, "tier_id");
      const creator_id = ownGet(raw, "creator_id");
      const title = ownGet(raw, "title");
      const upstream_updated_at = ownGet(raw, "upstream_updated_at");
      const version_seq = ownGet(raw, "version_seq");
      const campaign_id = ownGet(raw, "campaign_id");
      const amount_cents = ownGet(raw, "amount_cents");
      if (!isSafeId(tier_id)) {
        issues.push(issue(`${path}.tier_id`, "expected non-empty safe id string", "type"));
      }
      if (creator_id !== creatorId) {
        issues.push(
          issue(`${path}.creator_id`, "must match import creator_id", "reference")
        );
      }
      if (!isNonEmptyString(title)) {
        issues.push(issue(`${path}.title`, "expected non-empty string", "type"));
      }
      if (!isIsoDateTime(upstream_updated_at)) {
        issues.push(
          issue(`${path}.upstream_updated_at`, "expected valid ISO date-time", "format")
        );
      }
      if (!isFiniteNumber(version_seq) || !Number.isInteger(version_seq)) {
        issues.push(issue(`${path}.version_seq`, "expected integer", "type"));
      }
      if (campaign_id !== undefined && !isSafeId(campaign_id)) {
        issues.push(issue(`${path}.campaign_id`, "expected safe id when present", "type"));
      }
      if (
        amount_cents !== undefined &&
        (!isFiniteNumber(amount_cents) || amount_cents < 0)
      ) {
        issues.push(
          issue(`${path}.amount_cents`, "expected non-negative number when present", "type")
        );
      }
      if (
        isSafeId(tier_id) &&
        isNonEmptyString(title) &&
        isIsoDateTime(upstream_updated_at) &&
        isFiniteNumber(version_seq)
      ) {
        const row: CanonicalTierRow = {
          tier_id,
          creator_id: creatorId,
          title,
          upstream_updated_at,
          version_seq
        };
        if (isSafeId(campaign_id)) row.campaign_id = campaign_id;
        if (isFiniteNumber(amount_cents)) row.amount_cents = amount_cents;
        tiers[tier_id] = row;
      }
    }
  }

  if (issues.length > 0) throwIssues(issues);

  return {
    creator_id: creatorId,
    raw: input,
    posts,
    media,
    tiers
  };
}

// ---------------------------------------------------------------------------
// Export index (lightweight)
// ---------------------------------------------------------------------------

export type ParsedExportMedia = {
  media_id: string;
  relative_blob_path: string;
  mime_type?: string;
  sha256?: string;
  byte_length?: number;
  upstream_revision?: string;
  exported_at?: string;
};

export type ParsedExportIndex = {
  creator_id: string;
  media: Record<string, ParsedExportMedia>;
};

export function parseExportIndexForImport(
  input: unknown,
  creatorId: string
): ParsedExportIndex {
  const issues: ContractIssue[] = [];
  if (input === undefined || input === null) {
    return { creator_id: creatorId, media: Object.create(null) };
  }
  if (!isPlainObject(input)) {
    throwIssues([issue("export_index", "expected object", "type")]);
  }
  const creator_id = ownGet(input, "creator_id");
  if (!isSafeId(creator_id)) {
    issues.push(issue("export_index.creator_id", "expected non-empty safe id string", "type"));
  } else if (creator_id !== creatorId) {
    issues.push(
      issue("export_index.creator_id", "must match import creator_id", "reference")
    );
  }
  const mediaRaw = ownGet(input, "media");
  if (!isPlainObject(mediaRaw)) {
    issues.push(issue("export_index.media", "expected object", "type"));
  }
  const media: Record<string, ParsedExportMedia> = Object.create(null);
  if (isPlainObject(mediaRaw)) {
    for (const mediaId of Object.keys(mediaRaw)) {
      if (DANGEROUS_KEYS.has(mediaId)) continue;
      const path = `export_index.media.${mediaId}`;
      const raw = ownGet(mediaRaw, mediaId);
      if (!isPlainObject(raw)) {
        issues.push(issue(path, "expected object", "type"));
        continue;
      }
      const media_id = ownGet(raw, "media_id") ?? mediaId;
      const relative_blob_path = ownGet(raw, "relative_blob_path");
      if (!isSafeId(media_id)) {
        issues.push(issue(`${path}.media_id`, "expected safe id", "type"));
      }
      if (!isSafeRelativeBlobPath(relative_blob_path)) {
        issues.push(
          issue(
            `${path}.relative_blob_path`,
            "expected safe relative path under export root (no absolute, drive, UNC, or . / .. segments)",
            "path"
          )
        );
      }
      if (!isSafeId(media_id) || !isSafeRelativeBlobPath(relative_blob_path)) continue;
      const entry: ParsedExportMedia = {
        media_id,
        relative_blob_path
      };
      const mime_type = ownGet(raw, "mime_type");
      const sha256 = ownGet(raw, "sha256");
      const byte_length = ownGet(raw, "byte_length");
      const upstream_revision = ownGet(raw, "upstream_revision");
      const exported_at = ownGet(raw, "exported_at");
      if (typeof mime_type === "string") entry.mime_type = mime_type;
      if (typeof sha256 === "string") entry.sha256 = sha256;
      if (isFiniteNumber(byte_length) && byte_length >= 0) entry.byte_length = byte_length;
      if (typeof upstream_revision === "string") entry.upstream_revision = upstream_revision;
      if (typeof exported_at === "string") entry.exported_at = exported_at;
      media[media_id] = entry;
    }
  }
  if (issues.length > 0) throwIssues(issues);
  return { creator_id: creatorId, media };
}

// ---------------------------------------------------------------------------
// Provenance / local state / report parsers
// ---------------------------------------------------------------------------

function parseAccessSnapshot(
  value: unknown,
  path: string,
  issues: ContractIssue[]
): ProvenanceAccessSnapshot | null {
  if (!isPlainObject(value)) {
    issues.push(issue(path, "expected object", "type"));
    return null;
  }
  const level = ownGet(value, "level");
  if (typeof level !== "string" || !(ACCESS_LEVELS as readonly string[]).includes(level)) {
    issues.push(issue(`${path}.level`, `expected one of ${ACCESS_LEVELS.join(", ")}`, "enum"));
    return null;
  }
  const tier_ids = expectStringArray(ownGet(value, "tier_ids"), `${path}.tier_ids`, issues);
  const matchRaw = ownGet(value, "match_mode");
  let match_mode: TierMatchMode | undefined;
  if (matchRaw !== undefined) {
    if (
      typeof matchRaw !== "string" ||
      !(TIER_MATCH_MODES as readonly string[]).includes(matchRaw)
    ) {
      issues.push(
        issue(`${path}.match_mode`, `expected one of ${TIER_MATCH_MODES.join(", ")}`, "enum")
      );
    } else {
      match_mode = matchRaw as TierMatchMode;
    }
  }
  const out: ProvenanceAccessSnapshot = {
    level: level as AccessLevel,
    tier_ids: [...tier_ids]
  };
  if (match_mode) out.match_mode = match_mode;
  return out;
}

function parseProvenanceMedia(
  value: unknown,
  path: string,
  issues: ContractIssue[]
): ProvenanceMediaEntry | null {
  if (!isPlainObject(value)) {
    issues.push(issue(path, "expected object", "type"));
    return null;
  }
  const media_id = ownGet(value, "media_id");
  const provider_object_id = ownGet(value, "provider_object_id");
  const has_export = ownGet(value, "has_export");
  if (!isSafeId(media_id)) {
    issues.push(issue(`${path}.media_id`, "expected safe id", "type"));
  }
  if (!isSafeId(provider_object_id)) {
    issues.push(issue(`${path}.provider_object_id`, "expected safe id", "type"));
  }
  if (typeof has_export !== "boolean") {
    issues.push(issue(`${path}.has_export`, "expected boolean", "type"));
  }
  if (!isSafeId(media_id) || !isSafeId(provider_object_id) || typeof has_export !== "boolean") {
    return null;
  }
  const out: ProvenanceMediaEntry = {
    media_id,
    provider_object_id,
    has_export
  };
  const mime_type = ownGet(value, "mime_type");
  const byte_length = ownGet(value, "byte_length");
  const checksum = ownGet(value, "checksum");
  const upstream_revision = ownGet(value, "upstream_revision");
  const blob_missing = ownGet(value, "blob_missing");
  if (typeof mime_type === "string") out.mime_type = mime_type;
  if (isFiniteNumber(byte_length) && byte_length >= 0) out.byte_length = byte_length;
  if (typeof checksum === "string") out.checksum = checksum;
  if (typeof upstream_revision === "string") out.upstream_revision = upstream_revision;
  if (typeof blob_missing === "boolean") out.blob_missing = blob_missing;
  return out;
}

export function parseImportProvenance(input: unknown): ImportProvenance {
  const issues: ContractIssue[] = [];
  if (!isPlainObject(input)) {
    throwIssues([issue("(root)", "expected object", "type")]);
  }
  const version = ownGet(input, "contract_version");
  if (version !== IMPORT_PROVENANCE_CONTRACT_VERSION) {
    issues.push(
      issue(
        "contract_version",
        `unsupported version; expected ${IMPORT_PROVENANCE_CONTRACT_VERSION}`,
        "unsupported_version"
      )
    );
  }
  const site_id = ownGet(input, "site_id");
  const creator_id = ownGet(input, "creator_id");
  const provider = ownGet(input, "provider");
  const batch_id = ownGet(input, "batch_id");
  const source_revision = ownGet(input, "source_revision");
  const imported_at = ownGet(input, "imported_at");
  if (!isSafeId(site_id)) issues.push(issue("site_id", "expected safe id", "type"));
  if (!isSafeId(creator_id)) issues.push(issue("creator_id", "expected safe id", "type"));
  if (provider !== "relay_canonical") {
    issues.push(issue("provider", 'expected "relay_canonical"', "enum"));
  }
  if (!isNonEmptyString(batch_id)) issues.push(issue("batch_id", "expected non-empty string", "type"));
  if (!isNonEmptyString(source_revision)) {
    issues.push(issue("source_revision", "expected non-empty string", "type"));
  }
  if (!isIsoDateTime(imported_at)) {
    issues.push(issue("imported_at", "expected valid ISO date-time", "format"));
  }

  const postsRaw = ownGet(input, "posts");
  const tiersRaw = ownGet(input, "tiers");
  const mediaRaw = ownGet(input, "media");
  if (!isPlainObject(postsRaw)) issues.push(issue("posts", "expected object", "type"));
  if (!isPlainObject(tiersRaw)) issues.push(issue("tiers", "expected object", "type"));
  if (!isPlainObject(mediaRaw)) issues.push(issue("media", "expected object", "type"));

  const posts: Record<string, ProvenancePostEntry> = Object.create(null);
  if (isPlainObject(postsRaw)) {
    for (const postId of Object.keys(postsRaw)) {
      if (DANGEROUS_KEYS.has(postId)) continue;
      const path = `posts.${postId}`;
      const raw = ownGet(postsRaw, postId);
      if (!isPlainObject(raw)) {
        issues.push(issue(path, "expected object", "type"));
        continue;
      }
      const provider_object_id = ownGet(raw, "provider_object_id");
      const published_at = ownGet(raw, "published_at");
      const upstream_revision = ownGet(raw, "upstream_revision");
      const upstream_status = ownGet(raw, "upstream_status");
      const source_tier_ids = expectStringArray(
        ownGet(raw, "source_tier_ids"),
        `${path}.source_tier_ids`,
        issues
      );
      const access_snapshot = parseAccessSnapshot(
        ownGet(raw, "access_snapshot"),
        `${path}.access_snapshot`,
        issues
      );
      const mediaListRaw = ownGet(raw, "media");
      const mediaList: ProvenanceMediaEntry[] = [];
      if (!Array.isArray(mediaListRaw)) {
        issues.push(issue(`${path}.media`, "expected array", "type"));
      } else {
        for (let i = 0; i < mediaListRaw.length; i++) {
          const m = parseProvenanceMedia(mediaListRaw[i], `${path}.media[${i}]`, issues);
          if (m) mediaList.push(m);
        }
      }
      if (
        isSafeId(provider_object_id) &&
        isIsoDateTime(published_at) &&
        isNonEmptyString(upstream_revision) &&
        (upstream_status === "active" || upstream_status === "deleted") &&
        access_snapshot &&
        ownGet(raw, "provider") === "relay_canonical"
      ) {
        posts[postId] = {
          provider: "relay_canonical",
          provider_object_id,
          published_at,
          upstream_revision,
          source_tier_ids: [...source_tier_ids],
          access_snapshot,
          media: mediaList,
          upstream_status
        };
      } else {
        if (ownGet(raw, "provider") !== "relay_canonical") {
          issues.push(issue(`${path}.provider`, 'expected "relay_canonical"', "enum"));
        }
        if (!isSafeId(provider_object_id)) {
          issues.push(issue(`${path}.provider_object_id`, "expected safe id", "type"));
        }
        if (!isIsoDateTime(published_at)) {
          issues.push(issue(`${path}.published_at`, "expected valid ISO date-time", "format"));
        }
        if (!isNonEmptyString(upstream_revision)) {
          issues.push(issue(`${path}.upstream_revision`, "expected non-empty string", "type"));
        }
        if (upstream_status !== "active" && upstream_status !== "deleted") {
          issues.push(
            issue(`${path}.upstream_status`, 'expected "active" or "deleted"', "enum")
          );
        }
      }
    }
  }

  const tiers: Record<string, ProvenanceTierEntry> = Object.create(null);
  if (isPlainObject(tiersRaw)) {
    for (const tierId of Object.keys(tiersRaw)) {
      if (DANGEROUS_KEYS.has(tierId)) continue;
      const path = `tiers.${tierId}`;
      const raw = ownGet(tiersRaw, tierId);
      if (!isPlainObject(raw)) {
        issues.push(issue(path, "expected object", "type"));
        continue;
      }
      const provider_object_id = ownGet(raw, "provider_object_id");
      const title = ownGet(raw, "title");
      if (!isSafeId(provider_object_id) || !isNonEmptyString(title)) {
        if (!isSafeId(provider_object_id)) {
          issues.push(issue(`${path}.provider_object_id`, "expected safe id", "type"));
        }
        if (!isNonEmptyString(title)) {
          issues.push(issue(`${path}.title`, "expected non-empty string", "type"));
        }
        continue;
      }
      const entry: ProvenanceTierEntry = { provider_object_id, title };
      const amount_cents = ownGet(raw, "amount_cents");
      const campaign_id = ownGet(raw, "campaign_id");
      const version_seq = ownGet(raw, "version_seq");
      if (amount_cents === null) entry.amount_cents = null;
      else if (isFiniteNumber(amount_cents)) entry.amount_cents = amount_cents;
      if (isSafeId(campaign_id)) entry.campaign_id = campaign_id;
      if (isFiniteNumber(version_seq)) entry.version_seq = version_seq;
      tiers[tierId] = entry;
    }
  }

  const media: Record<string, ProvenanceMediaEntry> = Object.create(null);
  if (isPlainObject(mediaRaw)) {
    for (const mediaId of Object.keys(mediaRaw)) {
      if (DANGEROUS_KEYS.has(mediaId)) continue;
      const m = parseProvenanceMedia(ownGet(mediaRaw, mediaId), `media.${mediaId}`, issues);
      if (m) media[mediaId] = m;
    }
  }

  if (issues.length > 0) throwIssues(issues);

  return {
    contract_version: IMPORT_PROVENANCE_CONTRACT_VERSION,
    site_id: site_id as string,
    creator_id: creator_id as string,
    provider: "relay_canonical",
    batch_id: batch_id as string,
    source_revision: source_revision as string,
    imported_at: imported_at as string,
    posts,
    tiers,
    media
  };
}

function parseConflictItem(
  value: unknown,
  path: string,
  issues: ContractIssue[]
): ConflictItem | null {
  if (!isPlainObject(value)) {
    issues.push(issue(path, "expected object", "type"));
    return null;
  }
  const id = ownGet(value, "id");
  const kind = ownGet(value, "kind");
  const summary = ownGet(value, "summary");
  const recommended_action = ownGet(value, "recommended_action");
  const field_paths = expectStringArray(
    ownGet(value, "field_paths"),
    `${path}.field_paths`,
    issues
  );
  if (!isNonEmptyString(id)) issues.push(issue(`${path}.id`, "expected non-empty string", "type"));
  if (typeof kind !== "string" || !(CONFLICT_KINDS as readonly string[]).includes(kind)) {
    issues.push(issue(`${path}.kind`, `expected one of ${CONFLICT_KINDS.join(", ")}`, "enum"));
  }
  if (!isNonEmptyString(summary)) {
    issues.push(issue(`${path}.summary`, "expected non-empty string", "type"));
  }
  if (!isNonEmptyString(recommended_action)) {
    issues.push(issue(`${path}.recommended_action`, "expected non-empty string", "type"));
  }
  if (
    !isNonEmptyString(id) ||
    typeof kind !== "string" ||
    !(CONFLICT_KINDS as readonly string[]).includes(kind) ||
    !isNonEmptyString(summary) ||
    !isNonEmptyString(recommended_action)
  ) {
    return null;
  }
  const out: ConflictItem = {
    id,
    kind: kind as ConflictItem["kind"],
    field_paths: [...field_paths],
    recommended_action,
    summary
  };
  const post_id = ownGet(value, "post_id");
  const media_id = ownGet(value, "media_id");
  const tier_id = ownGet(value, "tier_id");
  if (isSafeId(post_id)) out.post_id = post_id;
  if (isSafeId(media_id)) out.media_id = media_id;
  if (isSafeId(tier_id)) out.tier_id = tier_id;
  return out;
}

function parseLocalPost(
  value: unknown,
  path: string,
  issues: ContractIssue[]
): LocalPostState | null {
  if (!isPlainObject(value)) {
    issues.push(issue(path, "expected object", "type"));
    return null;
  }
  const slug = ownGet(value, "slug");
  const origin = ownGet(value, "origin");
  const locally_edited = ownGet(value, "locally_edited");
  const edit_markers = expectStringArray(
    ownGet(value, "edit_markers") ?? [],
    `${path}.edit_markers`,
    issues
  );
  if (!isSafeRouteSegment(slug)) {
    issues.push(issue(`${path}.slug`, "expected safe route segment", "path"));
  }
  if (typeof origin !== "string" || !(IMPORT_ORIGINS as readonly string[]).includes(origin)) {
    issues.push(issue(`${path}.origin`, `expected one of ${IMPORT_ORIGINS.join(", ")}`, "enum"));
  }
  if (typeof locally_edited !== "boolean") {
    issues.push(issue(`${path}.locally_edited`, "expected boolean", "type"));
  }
  if (
    !isSafeRouteSegment(slug) ||
    typeof origin !== "string" ||
    !(IMPORT_ORIGINS as readonly string[]).includes(origin) ||
    typeof locally_edited !== "boolean"
  ) {
    return null;
  }
  const out: LocalPostState = {
    slug,
    origin: origin as ImportOrigin,
    locally_edited,
    edit_markers: [...edit_markers]
  };
  const local_title = ownGet(value, "local_title");
  if (typeof local_title === "string") out.local_title = local_title;
  const redirects = ownGet(value, "redirects");
  if (redirects !== undefined) {
    out.redirects = expectStringArray(redirects, `${path}.redirects`, issues);
  }
  return out;
}

export function parseImportLocalState(input: unknown): ImportLocalState {
  const issues: ContractIssue[] = [];
  if (!isPlainObject(input)) {
    throwIssues([issue("(root)", "expected object", "type")]);
  }
  const version = ownGet(input, "contract_version");
  if (version !== IMPORT_LOCAL_STATE_CONTRACT_VERSION) {
    issues.push(
      issue(
        "contract_version",
        `unsupported version; expected ${IMPORT_LOCAL_STATE_CONTRACT_VERSION}`,
        "unsupported_version"
      )
    );
  }
  const site_id = ownGet(input, "site_id");
  const creator_id = ownGet(input, "creator_id");
  const updated_at = ownGet(input, "updated_at");
  if (!isSafeId(site_id)) issues.push(issue("site_id", "expected safe id", "type"));
  if (!isSafeId(creator_id)) issues.push(issue("creator_id", "expected safe id", "type"));
  if (!isIsoDateTime(updated_at)) {
    issues.push(issue("updated_at", "expected valid ISO date-time", "format"));
  }

  const postsRaw = ownGet(input, "posts");
  if (!isPlainObject(postsRaw)) issues.push(issue("posts", "expected object", "type"));
  const posts: Record<string, LocalPostState> = Object.create(null);
  if (isPlainObject(postsRaw)) {
    for (const postId of Object.keys(postsRaw)) {
      if (DANGEROUS_KEYS.has(postId)) continue;
      const p = parseLocalPost(ownGet(postsRaw, postId), `posts.${postId}`, issues);
      if (p) posts[postId] = p;
    }
  }

  const mappingsRaw = ownGet(input, "tier_mappings");
  const tier_mappings: Record<string, string> = Object.create(null);
  if (mappingsRaw === undefined) {
    // ok — empty
  } else if (!isPlainObject(mappingsRaw)) {
    issues.push(issue("tier_mappings", "expected object", "type"));
  } else {
    for (const key of Object.keys(mappingsRaw)) {
      if (DANGEROUS_KEYS.has(key)) continue;
      const val = ownGet(mappingsRaw, key);
      if (!isSafeId(key) || !isSafeId(val)) {
        issues.push(issue(`tier_mappings.${key}`, "expected safe id → safe id", "type"));
        continue;
      }
      tier_mappings[key] = val;
    }
  }

  const queueRaw = ownGet(input, "conflict_queue");
  const conflict_queue: ConflictItem[] = [];
  if (!Array.isArray(queueRaw)) {
    issues.push(issue("conflict_queue", "expected array", "type"));
  } else {
    for (let i = 0; i < queueRaw.length; i++) {
      const c = parseConflictItem(queueRaw[i], `conflict_queue[${i}]`, issues);
      if (c) conflict_queue.push(c);
    }
  }

  const ledgerRaw = ownGet(input, "replay_ledger");
  let replay_ledger: ReplayLedger | null = null;
  if (!isPlainObject(ledgerRaw)) {
    issues.push(issue("replay_ledger", "expected object", "type"));
  } else {
    const last_batch_id = ownGet(ledgerRaw, "last_batch_id");
    const last_source_revision = ownGet(ledgerRaw, "last_source_revision");
    const imported_post_ids = expectStringArray(
      ownGet(ledgerRaw, "imported_post_ids"),
      "replay_ledger.imported_post_ids",
      issues
    );
    const imported_media_ids = expectStringArray(
      ownGet(ledgerRaw, "imported_media_ids"),
      "replay_ledger.imported_media_ids",
      issues
    );
    if (!isNonEmptyString(last_batch_id) || !isNonEmptyString(last_source_revision)) {
      if (!isNonEmptyString(last_batch_id)) {
        issues.push(issue("replay_ledger.last_batch_id", "expected non-empty string", "type"));
      }
      if (!isNonEmptyString(last_source_revision)) {
        issues.push(
          issue("replay_ledger.last_source_revision", "expected non-empty string", "type")
        );
      }
    } else {
      replay_ledger = {
        last_batch_id,
        last_source_revision,
        imported_post_ids: [...imported_post_ids],
        imported_media_ids: [...imported_media_ids]
      };
    }
  }

  if (issues.length > 0) throwIssues(issues);

  return {
    contract_version: IMPORT_LOCAL_STATE_CONTRACT_VERSION,
    site_id: site_id as string,
    creator_id: creator_id as string,
    updated_at: updated_at as string,
    posts,
    tier_mappings,
    conflict_queue,
    replay_ledger: replay_ledger!
  };
}

export function parseImportReport(input: unknown): ImportReport {
  const issues: ContractIssue[] = [];
  if (!isPlainObject(input)) {
    throwIssues([issue("(root)", "expected object", "type")]);
  }
  const version = ownGet(input, "contract_version");
  if (version !== IMPORT_REPORT_CONTRACT_VERSION) {
    issues.push(
      issue(
        "contract_version",
        `unsupported version; expected ${IMPORT_REPORT_CONTRACT_VERSION}`,
        "unsupported_version"
      )
    );
  }
  // Report is creator-readable output; validate lightly for round-trip tests.
  const batch_id = ownGet(input, "batch_id");
  const creator_id = ownGet(input, "creator_id");
  const site_id = ownGet(input, "site_id");
  const generated_at = ownGet(input, "generated_at");
  const source_revision = ownGet(input, "source_revision");
  if (!isNonEmptyString(batch_id)) issues.push(issue("batch_id", "expected string", "type"));
  if (!isSafeId(creator_id)) issues.push(issue("creator_id", "expected safe id", "type"));
  if (!isSafeId(site_id)) issues.push(issue("site_id", "expected safe id", "type"));
  if (!isIsoDateTime(generated_at)) {
    issues.push(issue("generated_at", "expected ISO date-time", "format"));
  }
  if (!isNonEmptyString(source_revision)) {
    issues.push(issue("source_revision", "expected string", "type"));
  }
  if (issues.length > 0) throwIssues(issues);

  const asCounts = (raw: unknown, path: string) => {
    if (!isPlainObject(raw)) {
      throwIssues([issue(path, "expected object", "type")]);
    }
    const n = (k: string) => {
      const v = ownGet(raw, k);
      if (!isFiniteNumber(v) || !Number.isInteger(v) || v < 0) {
        throwIssues([issue(`${path}.${k}`, "expected non-negative integer", "type")]);
      }
      return v;
    };
    return {
      expected: n("expected"),
      imported: n("imported"),
      excluded: n("excluded"),
      failed: n("failed"),
      conflicts: n("conflicts")
    };
  };

  const posts = asCounts(ownGet(input, "posts"), "posts");
  const mediaRaw = ownGet(input, "media");
  if (!isPlainObject(mediaRaw)) {
    throwIssues([issue("media", "expected object", "type")]);
  }
  const media = {
    expected: Number(ownGet(mediaRaw, "expected")),
    imported: Number(ownGet(mediaRaw, "imported")),
    excluded: Number(ownGet(mediaRaw, "excluded")),
    failed: Number(ownGet(mediaRaw, "failed")),
    missing_export: Number(ownGet(mediaRaw, "missing_export"))
  };
  const tiersRaw = ownGet(input, "tiers");
  if (!isPlainObject(tiersRaw)) {
    throwIssues([issue("tiers", "expected object", "type")]);
  }
  const tiers = {
    expected: Number(ownGet(tiersRaw, "expected")),
    mapped: Number(ownGet(tiersRaw, "mapped")),
    unmapped: Number(ownGet(tiersRaw, "unmapped"))
  };

  const exclusions: AccountedItem[] = [];
  const exclusionsRaw = ownGet(input, "exclusions");
  if (Array.isArray(exclusionsRaw)) {
    for (const item of exclusionsRaw) {
      if (!isPlainObject(item)) continue;
      const kind = ownGet(item, "kind");
      if (typeof kind !== "string" || !(EXCLUSION_KINDS as readonly string[]).includes(kind)) {
        continue;
      }
      exclusions.push({
        id: String(ownGet(item, "id") ?? ""),
        kind: kind as ExclusionKind,
        reason: String(ownGet(item, "reason") ?? ""),
        field_paths: Array.isArray(ownGet(item, "field_paths"))
          ? (ownGet(item, "field_paths") as string[])
          : []
      });
    }
  }

  const failures: AccountedItem[] = [];
  const conflicts: ConflictItem[] = [];
  const conflictsRaw = ownGet(input, "conflicts");
  if (Array.isArray(conflictsRaw)) {
    for (let i = 0; i < conflictsRaw.length; i++) {
      const c = parseConflictItem(conflictsRaw[i], `conflicts[${i}]`, issues);
      if (c) conflicts.push(c);
    }
  }
  const notesRaw = ownGet(input, "notes");
  const notes = Array.isArray(notesRaw)
    ? notesRaw.filter((n): n is string => typeof n === "string")
    : [];

  if (issues.length > 0) throwIssues(issues);

  return {
    contract_version: IMPORT_REPORT_CONTRACT_VERSION,
    batch_id: batch_id as string,
    creator_id: creator_id as string,
    site_id: site_id as string,
    generated_at: generated_at as string,
    source_revision: source_revision as string,
    posts,
    media,
    tiers,
    exclusions,
    failures,
    conflicts,
    notes
  };
}

export function serializeImportDocument(doc: unknown): string {
  return `${JSON.stringify(doc, null, 2)}\n`;
}
