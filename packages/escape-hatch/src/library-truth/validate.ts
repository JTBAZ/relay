/**
 * Fail-closed parsers for EH-013 library-truth documents.
 * Errors expose field paths only — never payload dumps or credentials.
 */

import {
  ContractValidationError,
  type ContractIssue
} from "../contracts.js";
import {
  ANOMALY_KINDS,
  LIBRARY_PARITY_REPORT_CONTRACT_VERSION,
  LIBRARY_TRUTH_STATE_CONTRACT_VERSION,
  type AccessBucketInspect,
  type AccessSimulationRow,
  type AccountedCounts,
  type AccountedItemNote,
  type AnomalyKind,
  type LibraryAnomaly,
  type LibraryAnomalySubject,
  type LibraryParityReport,
  type LibraryTruthArtifactPresence,
  type LibraryTruthExclusion,
  type LibraryTruthIdentity,
  type LibraryTruthState,
  type MediaAccountedCounts,
  type TierAccountedCounts
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

function isFiniteNonNegInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function expectStringArray(
  value: unknown,
  path: string,
  issues: ContractIssue[]
): string[] {
  if (!Array.isArray(value)) {
    issues.push(issue(path, "expected array", "type"));
    return [];
  }
  const out: string[] = [];
  for (let i = 0; i < value.length; i++) {
    if (!isNonEmptyString(value[i])) {
      issues.push(issue(`${path}[${i}]`, "expected non-empty string", "type"));
    } else {
      out.push(value[i]);
    }
  }
  return out;
}

function parseSubject(
  input: unknown,
  path: string,
  issues: ContractIssue[]
): LibraryAnomalySubject {
  if (input === undefined) return {};
  if (!isPlainObject(input)) {
    issues.push(issue(path, "expected object", "type"));
    return {};
  }
  const subject: LibraryAnomalySubject = {};
  const post_ids = ownGet(input, "post_ids");
  if (post_ids !== undefined) {
    subject.post_ids = expectStringArray(post_ids, `${path}.post_ids`, issues);
  }
  const media_ids = ownGet(input, "media_ids");
  if (media_ids !== undefined) {
    subject.media_ids = expectStringArray(media_ids, `${path}.media_ids`, issues);
  }
  const tier_ids = ownGet(input, "tier_ids");
  if (tier_ids !== undefined) {
    subject.tier_ids = expectStringArray(tier_ids, `${path}.tier_ids`, issues);
  }
  return subject;
}

function parseAccountedCounts(
  input: unknown,
  path: string,
  issues: ContractIssue[]
): AccountedCounts | null {
  if (!isPlainObject(input)) {
    issues.push(issue(path, "expected object", "type"));
    return null;
  }
  const expected = ownGet(input, "expected");
  const imported = ownGet(input, "imported");
  const excluded = ownGet(input, "excluded");
  const failed = ownGet(input, "failed");
  const fully_accounted = ownGet(input, "fully_accounted");
  if (!isFiniteNonNegInt(expected)) {
    issues.push(issue(`${path}.expected`, "expected non-negative integer", "type"));
  }
  if (!isFiniteNonNegInt(imported)) {
    issues.push(issue(`${path}.imported`, "expected non-negative integer", "type"));
  }
  if (!isFiniteNonNegInt(excluded)) {
    issues.push(issue(`${path}.excluded`, "expected non-negative integer", "type"));
  }
  if (!isFiniteNonNegInt(failed)) {
    issues.push(issue(`${path}.failed`, "expected non-negative integer", "type"));
  }
  if (typeof fully_accounted !== "boolean") {
    issues.push(issue(`${path}.fully_accounted`, "expected boolean", "type"));
  }
  if (issues.some((i) => i.fieldPath.startsWith(path))) return null;
  return {
    expected: expected as number,
    imported: imported as number,
    excluded: excluded as number,
    failed: failed as number,
    fully_accounted: fully_accounted as boolean
  };
}

function parseMediaCounts(
  input: unknown,
  path: string,
  issues: ContractIssue[]
): MediaAccountedCounts | null {
  if (!isPlainObject(input)) {
    issues.push(issue(path, "expected object", "type"));
    return null;
  }
  const fields = [
    "expected",
    "imported",
    "copied",
    "verified",
    "failed",
    "missing",
    "excluded"
  ] as const;
  for (const f of fields) {
    if (!isFiniteNonNegInt(ownGet(input, f))) {
      issues.push(issue(`${path}.${f}`, "expected non-negative integer", "type"));
    }
  }
  const fully_accounted = ownGet(input, "fully_accounted");
  if (typeof fully_accounted !== "boolean") {
    issues.push(issue(`${path}.fully_accounted`, "expected boolean", "type"));
  }
  if (issues.some((i) => i.fieldPath.startsWith(path))) return null;
  return {
    expected: ownGet(input, "expected") as number,
    imported: ownGet(input, "imported") as number,
    copied: ownGet(input, "copied") as number,
    verified: ownGet(input, "verified") as number,
    failed: ownGet(input, "failed") as number,
    missing: ownGet(input, "missing") as number,
    excluded: ownGet(input, "excluded") as number,
    fully_accounted: fully_accounted as boolean
  };
}

function parseAnomaly(
  input: unknown,
  path: string,
  issues: ContractIssue[]
): LibraryAnomaly | null {
  if (!isPlainObject(input)) {
    issues.push(issue(path, "expected object", "type"));
    return null;
  }
  const id = ownGet(input, "id");
  const kind = ownGet(input, "kind");
  const blocking = ownGet(input, "blocking");
  const what_was_seen = ownGet(input, "what_was_seen");
  const likely_effect = ownGet(input, "likely_effect");
  const recommended_resolution = ownGet(input, "recommended_resolution");
  if (!isSafeId(id)) {
    issues.push(issue(`${path}.id`, "expected safe id", "type"));
  }
  if (
    typeof kind !== "string" ||
    !(ANOMALY_KINDS as readonly string[]).includes(kind)
  ) {
    issues.push(issue(`${path}.kind`, "unsupported anomaly kind", "type"));
  }
  if (typeof blocking !== "boolean") {
    issues.push(issue(`${path}.blocking`, "expected boolean", "type"));
  }
  for (const [field, val] of [
    ["what_was_seen", what_was_seen],
    ["likely_effect", likely_effect],
    ["recommended_resolution", recommended_resolution]
  ] as const) {
    if (!isNonEmptyString(val) || val.length > 2000) {
      issues.push(issue(`${path}.${field}`, "expected non-empty string", "type"));
    }
  }
  const subject = parseSubject(ownGet(input, "subject"), `${path}.subject`, issues);
  if (issues.some((i) => i.fieldPath.startsWith(path))) return null;
  return {
    id: id as string,
    kind: kind as AnomalyKind,
    blocking: blocking as boolean,
    subject,
    what_was_seen: what_was_seen as string,
    likely_effect: likely_effect as string,
    recommended_resolution: recommended_resolution as string
  };
}

export function parseLibraryParityReport(input: unknown): LibraryParityReport {
  const issues: ContractIssue[] = [];
  if (!isPlainObject(input)) {
    throwIssues([issue("(root)", "expected object", "type")]);
  }
  const contract_version = ownGet(input, "contract_version");
  if (contract_version !== LIBRARY_PARITY_REPORT_CONTRACT_VERSION) {
    issues.push(
      issue(
        "contract_version",
        `expected ${LIBRARY_PARITY_REPORT_CONTRACT_VERSION}`,
        "version"
      )
    );
  }
  const production_safe = ownGet(input, "production_safe");
  if (production_safe !== false) {
    issues.push(
      issue("production_safe", "must be false for library-parity-report", "honesty")
    );
  }
  const site_id = ownGet(input, "site_id");
  const creator_id = ownGet(input, "creator_id");
  const generated_at = ownGet(input, "generated_at");
  if (!isSafeId(site_id)) {
    issues.push(issue("site_id", "expected safe id", "type"));
  }
  if (!isSafeId(creator_id)) {
    issues.push(issue("creator_id", "expected safe id", "type"));
  }
  if (!isIsoDateTime(generated_at)) {
    issues.push(issue("generated_at", "expected ISO date-time", "format"));
  }

  const artifactsRaw = ownGet(input, "artifacts");
  let artifacts: LibraryTruthArtifactPresence | null = null;
  if (!isPlainObject(artifactsRaw)) {
    issues.push(issue("artifacts", "expected object", "type"));
  } else {
    const keys = [
      "site_bundle",
      "import_report",
      "provenance",
      "import_state",
      "media_migration_ledger",
      "media_migration_report"
    ] as const;
    const a: Partial<LibraryTruthArtifactPresence> = {};
    for (const k of keys) {
      const v = ownGet(artifactsRaw, k);
      if (typeof v !== "boolean") {
        issues.push(issue(`artifacts.${k}`, "expected boolean", "type"));
      } else {
        a[k] = v;
      }
    }
    if (keys.every((k) => typeof a[k] === "boolean")) {
      artifacts = a as LibraryTruthArtifactPresence;
    }
  }

  const identityRaw = ownGet(input, "identity");
  let identity: LibraryTruthIdentity | null = null;
  if (!isPlainObject(identityRaw)) {
    issues.push(issue("identity", "expected object", "type"));
  } else {
    const display_name = ownGet(identityRaw, "display_name");
    const handle = ownGet(identityRaw, "handle");
    const cid = ownGet(identityRaw, "creator_id");
    const sid = ownGet(identityRaw, "site_id");
    if (!isNonEmptyString(display_name)) {
      issues.push(issue("identity.display_name", "expected string", "type"));
    }
    if (!isNonEmptyString(handle)) {
      issues.push(issue("identity.handle", "expected string", "type"));
    }
    if (!isSafeId(cid)) {
      issues.push(issue("identity.creator_id", "expected safe id", "type"));
    }
    if (!isSafeId(sid)) {
      issues.push(issue("identity.site_id", "expected safe id", "type"));
    }
    if (
      isNonEmptyString(display_name) &&
      isNonEmptyString(handle) &&
      isSafeId(cid) &&
      isSafeId(sid)
    ) {
      identity = {
        display_name,
        handle,
        creator_id: cid,
        site_id: sid
      };
    }
  }

  const posts = parseAccountedCounts(ownGet(input, "posts"), "posts", issues);
  const media = parseMediaCounts(ownGet(input, "media"), "media", issues);

  const attachmentsRaw = ownGet(input, "attachments");
  let attachments: { expected: number; accounted: number } | null = null;
  if (!isPlainObject(attachmentsRaw)) {
    issues.push(issue("attachments", "expected object", "type"));
  } else {
    const expected = ownGet(attachmentsRaw, "expected");
    const accounted = ownGet(attachmentsRaw, "accounted");
    if (!isFiniteNonNegInt(expected) || !isFiniteNonNegInt(accounted)) {
      issues.push(issue("attachments", "expected non-negative integers", "type"));
    } else {
      attachments = { expected, accounted };
    }
  }

  const tiersRaw = ownGet(input, "tiers");
  let tiers: TierAccountedCounts | null = null;
  if (!isPlainObject(tiersRaw)) {
    issues.push(issue("tiers", "expected object", "type"));
  } else {
    const expected = ownGet(tiersRaw, "expected");
    const mapped = ownGet(tiersRaw, "mapped");
    const unmapped = ownGet(tiersRaw, "unmapped");
    const catalogRaw = ownGet(tiersRaw, "catalog");
    if (
      !isFiniteNonNegInt(expected) ||
      !isFiniteNonNegInt(mapped) ||
      !isFiniteNonNegInt(unmapped)
    ) {
      issues.push(issue("tiers", "expected non-negative integers", "type"));
    }
    if (!Array.isArray(catalogRaw)) {
      issues.push(issue("tiers.catalog", "expected array", "type"));
    } else {
      const catalog: TierAccountedCounts["catalog"] = [];
      for (let i = 0; i < catalogRaw.length; i++) {
        const row = catalogRaw[i];
        if (!isPlainObject(row)) {
          issues.push(issue(`tiers.catalog[${i}]`, "expected object", "type"));
          continue;
        }
        const tier_id = ownGet(row, "tier_id");
        const title = ownGet(row, "title");
        if (!isSafeId(tier_id) || !isNonEmptyString(title)) {
          issues.push(issue(`tiers.catalog[${i}]`, "invalid tier row", "type"));
          continue;
        }
        const amount_cents = ownGet(row, "amount_cents");
        const entry: TierAccountedCounts["catalog"][number] = {
          tier_id,
          title
        };
        if (
          amount_cents === null ||
          (typeof amount_cents === "number" && Number.isInteger(amount_cents))
        ) {
          entry.amount_cents = amount_cents as number | null;
        }
        catalog.push(entry);
      }
      if (
        isFiniteNonNegInt(expected) &&
        isFiniteNonNegInt(mapped) &&
        isFiniteNonNegInt(unmapped)
      ) {
        tiers = { expected, mapped, unmapped, catalog };
      }
    }
  }

  const anomaliesRaw = ownGet(input, "anomalies");
  const anomalies: LibraryAnomaly[] = [];
  if (!Array.isArray(anomaliesRaw)) {
    issues.push(issue("anomalies", "expected array", "type"));
  } else {
    for (let i = 0; i < anomaliesRaw.length; i++) {
      const a = parseAnomaly(anomaliesRaw[i], `anomalies[${i}]`, issues);
      if (a) anomalies.push(a);
    }
  }

  const exclusionsRaw = ownGet(input, "exclusions");
  const exclusions: AccountedItemNote[] = [];
  if (!Array.isArray(exclusionsRaw)) {
    issues.push(issue("exclusions", "expected array", "type"));
  } else {
    for (let i = 0; i < exclusionsRaw.length; i++) {
      const row = exclusionsRaw[i];
      if (!isPlainObject(row)) {
        issues.push(issue(`exclusions[${i}]`, "expected object", "type"));
        continue;
      }
      const id = ownGet(row, "id");
      const disposition = ownGet(row, "disposition");
      const reason = ownGet(row, "reason");
      if (
        !isSafeId(id) ||
        (disposition !== "imported" &&
          disposition !== "excluded" &&
          disposition !== "failed") ||
        !isNonEmptyString(reason)
      ) {
        issues.push(issue(`exclusions[${i}]`, "invalid exclusion note", "type"));
        continue;
      }
      const note: AccountedItemNote = {
        id,
        disposition,
        reason
      };
      const post_id = ownGet(row, "post_id");
      const media_id = ownGet(row, "media_id");
      if (post_id !== undefined) {
        if (!isSafeId(post_id)) {
          issues.push(issue(`exclusions[${i}].post_id`, "expected safe id", "type"));
        } else note.post_id = post_id;
      }
      if (media_id !== undefined) {
        if (!isSafeId(media_id)) {
          issues.push(issue(`exclusions[${i}].media_id`, "expected safe id", "type"));
        } else note.media_id = media_id;
      }
      exclusions.push(note);
    }
  }

  const failuresRaw = ownGet(input, "failures");
  const failures: AccountedItemNote[] = [];
  if (!Array.isArray(failuresRaw)) {
    issues.push(issue("failures", "expected array", "type"));
  } else {
    for (let i = 0; i < failuresRaw.length; i++) {
      const row = failuresRaw[i];
      if (!isPlainObject(row)) {
        issues.push(issue(`failures[${i}]`, "expected object", "type"));
        continue;
      }
      const id = ownGet(row, "id");
      const disposition = ownGet(row, "disposition");
      const reason = ownGet(row, "reason");
      if (
        !isSafeId(id) ||
        disposition !== "failed" ||
        !isNonEmptyString(reason)
      ) {
        issues.push(issue(`failures[${i}]`, "invalid failure note", "type"));
        continue;
      }
      const note: AccountedItemNote = { id, disposition: "failed", reason };
      const post_id = ownGet(row, "post_id");
      const media_id = ownGet(row, "media_id");
      if (isSafeId(post_id)) note.post_id = post_id;
      if (isSafeId(media_id)) note.media_id = media_id;
      failures.push(note);
    }
  }

  const conflictsRaw = ownGet(input, "conflicts");
  const conflicts: LibraryParityReport["conflicts"] = [];
  if (!Array.isArray(conflictsRaw)) {
    issues.push(issue("conflicts", "expected array", "type"));
  } else {
    for (let i = 0; i < conflictsRaw.length; i++) {
      const row = conflictsRaw[i];
      if (!isPlainObject(row)) {
        issues.push(issue(`conflicts[${i}]`, "expected object", "type"));
        continue;
      }
      const id = ownGet(row, "id");
      const kind = ownGet(row, "kind");
      const summary = ownGet(row, "summary");
      const recommended_action = ownGet(row, "recommended_action");
      if (
        !isSafeId(id) ||
        !isNonEmptyString(kind) ||
        !isNonEmptyString(summary) ||
        !isNonEmptyString(recommended_action)
      ) {
        issues.push(issue(`conflicts[${i}]`, "invalid conflict row", "type"));
        continue;
      }
      const c: LibraryParityReport["conflicts"][number] = {
        id,
        kind,
        summary,
        recommended_action
      };
      const post_id = ownGet(row, "post_id");
      const media_id = ownGet(row, "media_id");
      const tier_id = ownGet(row, "tier_id");
      if (isSafeId(post_id)) c.post_id = post_id;
      if (isSafeId(media_id)) c.media_id = media_id;
      if (isSafeId(tier_id)) c.tier_id = tier_id;
      conflicts.push(c);
    }
  }

  const bucketsRaw = ownGet(input, "access_buckets");
  const access_buckets: AccessBucketInspect[] = [];
  if (!Array.isArray(bucketsRaw)) {
    issues.push(issue("access_buckets", "expected array", "type"));
  } else {
    for (let i = 0; i < bucketsRaw.length; i++) {
      const row = bucketsRaw[i];
      if (!isPlainObject(row)) {
        issues.push(issue(`access_buckets[${i}]`, "expected object", "type"));
        continue;
      }
      const id = ownGet(row, "id");
      const title = ownGet(row, "title");
      const blurb = ownGet(row, "blurb");
      const post_ids = expectStringArray(
        ownGet(row, "post_ids"),
        `access_buckets[${i}].post_ids`,
        issues
      );
      const post_count = ownGet(row, "post_count");
      const media_count = ownGet(row, "media_count");
      if (
        !isSafeId(id) ||
        !isNonEmptyString(title) ||
        !isNonEmptyString(blurb) ||
        !isFiniteNonNegInt(post_count) ||
        !isFiniteNonNegInt(media_count)
      ) {
        issues.push(issue(`access_buckets[${i}]`, "invalid bucket", "type"));
        continue;
      }
      access_buckets.push({
        id,
        title,
        blurb,
        post_ids,
        post_count,
        media_count
      });
    }
  }

  const simsRaw = ownGet(input, "access_simulations");
  const access_simulations: AccessSimulationRow[] = [];
  if (!Array.isArray(simsRaw)) {
    issues.push(issue("access_simulations", "expected array", "type"));
  } else {
    for (let i = 0; i < simsRaw.length; i++) {
      const row = simsRaw[i];
      if (!isPlainObject(row)) {
        issues.push(issue(`access_simulations[${i}]`, "expected object", "type"));
        continue;
      }
      const bucket_id = ownGet(row, "bucket_id");
      const bucket_title = ownGet(row, "bucket_title");
      const visible_post_ids = expectStringArray(
        ownGet(row, "visible_post_ids"),
        `access_simulations[${i}].visible_post_ids`,
        issues
      );
      const visible_count = ownGet(row, "visible_count");
      const locked_count = ownGet(row, "locked_count");
      const non_authoritative = ownGet(row, "non_authoritative");
      if (
        !isSafeId(bucket_id) ||
        !isNonEmptyString(bucket_title) ||
        !isFiniteNonNegInt(visible_count) ||
        !isFiniteNonNegInt(locked_count) ||
        non_authoritative !== true
      ) {
        issues.push(issue(`access_simulations[${i}]`, "invalid simulation", "type"));
        continue;
      }
      access_simulations.push({
        bucket_id,
        bucket_title,
        visible_post_ids,
        visible_count,
        locked_count,
        non_authoritative: true
      });
    }
  }

  const access_notes = expectStringArray(
    ownGet(input, "access_notes"),
    "access_notes",
    issues
  );
  const creator_notes = expectStringArray(
    ownGet(input, "creator_notes"),
    "creator_notes",
    issues
  );
  const notes = expectStringArray(ownGet(input, "notes"), "notes", issues);

  const gateRaw = ownGet(input, "gate");
  let gate: LibraryParityReport["gate"] | null = null;
  if (!isPlainObject(gateRaw)) {
    issues.push(issue("gate", "expected object", "type"));
  } else {
    const fully_accounted = ownGet(gateRaw, "fully_accounted");
    const blocking_anomaly_ids = expectStringArray(
      ownGet(gateRaw, "blocking_anomaly_ids"),
      "gate.blocking_anomaly_ids",
      issues
    );
    const unresolved_blocking_count = ownGet(gateRaw, "unresolved_blocking_count");
    const can_continue_without_exclusions = ownGet(
      gateRaw,
      "can_continue_without_exclusions"
    );
    if (
      typeof fully_accounted !== "boolean" ||
      !isFiniteNonNegInt(unresolved_blocking_count) ||
      typeof can_continue_without_exclusions !== "boolean"
    ) {
      issues.push(issue("gate", "invalid gate snapshot", "type"));
    } else {
      gate = {
        fully_accounted,
        blocking_anomaly_ids,
        unresolved_blocking_count,
        can_continue_without_exclusions
      };
    }
  }

  if (issues.length > 0) throwIssues(issues);
  if (
    !artifacts ||
    !identity ||
    !posts ||
    !media ||
    !attachments ||
    !tiers ||
    !gate
  ) {
    throwIssues([issue("(root)", "incomplete report", "invalid")]);
  }

  return {
    contract_version: LIBRARY_PARITY_REPORT_CONTRACT_VERSION,
    site_id: site_id as string,
    creator_id: creator_id as string,
    generated_at: generated_at as string,
    production_safe: false,
    artifacts,
    identity,
    posts,
    media,
    attachments,
    tiers,
    exclusions,
    failures,
    conflicts,
    anomalies,
    access_buckets,
    access_simulations,
    access_notes,
    gate,
    creator_notes,
    notes
  };
}

export function parseLibraryTruthState(input: unknown): LibraryTruthState {
  const issues: ContractIssue[] = [];
  if (!isPlainObject(input)) {
    throwIssues([issue("(root)", "expected object", "type")]);
  }
  const contract_version = ownGet(input, "contract_version");
  if (contract_version !== LIBRARY_TRUTH_STATE_CONTRACT_VERSION) {
    issues.push(
      issue(
        "contract_version",
        `expected ${LIBRARY_TRUTH_STATE_CONTRACT_VERSION}`,
        "version"
      )
    );
  }
  const production_safe = ownGet(input, "production_safe");
  if (production_safe !== false) {
    issues.push(
      issue("production_safe", "must be false for library-truth-state", "honesty")
    );
  }
  const site_id = ownGet(input, "site_id");
  const creator_id = ownGet(input, "creator_id");
  const updated_at = ownGet(input, "updated_at");
  const library_truth_complete = ownGet(input, "library_truth_complete");
  if (!isSafeId(site_id)) {
    issues.push(issue("site_id", "expected safe id", "type"));
  }
  if (!isSafeId(creator_id)) {
    issues.push(issue("creator_id", "expected safe id", "type"));
  }
  if (!isIsoDateTime(updated_at)) {
    issues.push(issue("updated_at", "expected ISO date-time", "format"));
  }
  if (typeof library_truth_complete !== "boolean") {
    issues.push(issue("library_truth_complete", "expected boolean", "type"));
  }

  const exclusionsRaw = ownGet(input, "exclusions");
  const exclusions: Record<string, LibraryTruthExclusion> = Object.create(null);
  if (!isPlainObject(exclusionsRaw)) {
    issues.push(issue("exclusions", "expected object", "type"));
  } else {
    for (const key of Object.keys(exclusionsRaw)) {
      if (DANGEROUS_KEYS.has(key) || !isSafeId(key)) {
        issues.push(issue(`exclusions.${key}`, "invalid exclusion key", "type"));
        continue;
      }
      const row = ownGet(exclusionsRaw, key);
      if (!isPlainObject(row)) {
        issues.push(issue(`exclusions.${key}`, "expected object", "type"));
        continue;
      }
      const anomaly_id = ownGet(row, "anomaly_id");
      const reason = ownGet(row, "reason");
      const excluded_at = ownGet(row, "excluded_at");
      if (
        !isSafeId(anomaly_id) ||
        anomaly_id !== key ||
        !isNonEmptyString(reason) ||
        !isIsoDateTime(excluded_at)
      ) {
        issues.push(issue(`exclusions.${key}`, "invalid exclusion entry", "type"));
        continue;
      }
      exclusions[key] = {
        anomaly_id,
        reason,
        excluded_at,
        subject: parseSubject(ownGet(row, "subject"), `exclusions.${key}.subject`, issues)
      };
    }
  }

  const completed_at = ownGet(input, "completed_at");
  if (completed_at !== undefined && !isIsoDateTime(completed_at)) {
    issues.push(issue("completed_at", "expected ISO date-time", "format"));
  }

  if (issues.length > 0) throwIssues(issues);

  const state: LibraryTruthState = {
    contract_version: LIBRARY_TRUTH_STATE_CONTRACT_VERSION,
    site_id: site_id as string,
    creator_id: creator_id as string,
    updated_at: updated_at as string,
    production_safe: false,
    exclusions,
    library_truth_complete: library_truth_complete as boolean
  };
  if (typeof completed_at === "string") state.completed_at = completed_at;
  return state;
}

export function serializeLibraryTruthDocument(
  doc: LibraryParityReport | LibraryTruthState
): string {
  return `${JSON.stringify(doc, null, 2)}\n`;
}

/** Lightweight secret/PII scan for serialized library-truth JSON. */
export function assertNoSecretsInLibraryTruthJson(json: string): void {
  const patterns: Array<{ re: RegExp; label: string }> = [
    { re: /AKIA[0-9A-Z]{16}/, label: "aws_access_key" },
    { re: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/, label: "private_key" },
    { re: /sk_live_[A-Za-z0-9]+/, label: "stripe_live_key" },
    { re: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./, label: "jwt_like" },
    { re: /patron@[a-z0-9.-]+\.[a-z]{2,}/i, label: "email_like" }
  ];
  for (const { re, label } of patterns) {
    if (re.test(json)) {
      throw new Error(`library-truth output must not contain ${label}`);
    }
  }
}
