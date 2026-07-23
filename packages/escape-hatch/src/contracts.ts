/**
 * Escape Hatch shared contracts (EH-001).
 *
 * Self-contained, portable types + runtime validation + preview access evaluator.
 * Generated apps receive a byte-identical copy of this module (see fill-template).
 *
 * Authorization honesty: `canAccessPost` / `canViewPost` are client-side soft-gate
 * preview helpers only. They are not server authorization, RLS, or media delivery policy.
 *
 * Compatibility policy (legacy v0 fixtures):
 * - Unversioned SiteBundle / CloneSiteModel input is accepted as prior version
 *   site-bundle/0 or clone-site-model/0 and upgraded to the current contract
 *   (version field written on serialize).
 * - Tiers without amount_cents keep v0 exact-id tier_gated behavior (floors unknown).
 * - Missing persona tier_catalog is filled from site.tiers during upgrade so
 *   canViewPost(post, persona) can apply catalog rules without UI changes.
 * - Unknown / future major versions fail closed.
 */

// ---------------------------------------------------------------------------
// Version constants (serialized into output — not TypeScript-only)
// ---------------------------------------------------------------------------

/** Prior unversioned SiteBundle documents (fixtures, early CLI output). */
export const SITE_BUNDLE_CONTRACT_VERSION_LEGACY = "site-bundle/0" as const;

/** Current SiteBundle / generated-app data contract. */
export const SITE_BUNDLE_CONTRACT_VERSION = "site-bundle/1.0.0" as const;

/** Prior unversioned CloneSiteModel input documents. */
export const CLONE_SITE_MODEL_CONTRACT_VERSION_LEGACY =
  "clone-site-model/0" as const;

/** Current CloneSiteModel input contract. */
export const CLONE_SITE_MODEL_CONTRACT_VERSION =
  "clone-site-model/1.0.0" as const;

/** Generated-app data boundary uses the SiteBundle contract version. */
export const GENERATED_APP_DATA_CONTRACT_VERSION =
  SITE_BUNDLE_CONTRACT_VERSION;

export type SiteBundleContractVersion =
  | typeof SITE_BUNDLE_CONTRACT_VERSION_LEGACY
  | typeof SITE_BUNDLE_CONTRACT_VERSION;

export type CloneSiteModelContractVersion =
  | typeof CLONE_SITE_MODEL_CONTRACT_VERSION_LEGACY
  | typeof CLONE_SITE_MODEL_CONTRACT_VERSION;

export const ACCESS_LEVELS = ["public", "member_only", "tier_gated"] as const;
export type AccessLevel = (typeof ACCESS_LEVELS)[number];

export const PAYWALL_STYLES = ["blur", "hard", "teaser"] as const;
export type PaywallStyle = (typeof PAYWALL_STYLES)[number];

export const COLOR_SCHEMES = ["dark", "light", "warm"] as const;
export type ColorScheme = (typeof COLOR_SCHEMES)[number];

/** Approved visitor typography pairings (no arbitrary font picker). */
export const TYPE_PAIRINGS = ["editorial", "studio", "signal"] as const;
export type TypePairing = (typeof TYPE_PAIRINGS)[number];

/** Gallery grid density dial. */
export const GALLERY_DENSITIES = ["comfortable", "compact"] as const;
export type GalleryDensity = (typeof GALLERY_DENSITIES)[number];

/** Safe cover-crop focus for grid thumbs. */
export const COVER_CROPS = ["center", "top", "safe"] as const;
export type CoverCrop = (typeof COVER_CROPS)[number];

/** Tier-gated match mode. Default `tier_or_higher` aligns with Relay tier-rules. */
export const TIER_MATCH_MODES = ["exact", "tier_or_higher"] as const;
export type TierMatchMode = (typeof TIER_MATCH_MODES)[number];

/** Synthetic Relay tier sentinels (never count as paid pledges). */
export const RELAY_TIER_PUBLIC = "relay_tier_public";
export const RELAY_TIER_ALL_PATRONS = "relay_tier_all_patrons";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CloneTierRule = {
  tier_id: string;
  title: string;
  access_level: AccessLevel;
  campaign_id?: string;
  /**
   * Pledge floor in cents. When present and finite, enables paid/free classification
   * and tier-or-higher ordering (canonical tier-rules alignment).
   * Omitted/null on legacy fixtures → exact id match only for tier_gated.
   */
  amount_cents?: number | null;
};

export type CloneMediaRef = {
  media_id: string;
  mime_type?: string;
  has_export: boolean;
  /** Relative URL under the generated site, e.g. /media/m1.svg */
  content_path: string;
};

export type PostAccess = {
  level: AccessLevel;
  tier_ids: string[];
  /**
   * How `tier_gated` requirements are evaluated when floors are known.
   * Default: `tier_or_higher` (Relay canAccessPost / userMeetsTierGatesWithOrdering).
   * Legacy documents without this field upgrade to `tier_or_higher`.
   */
  match_mode?: TierMatchMode;
};

export type ClonePostEntry = {
  post_id: string;
  slug: string;
  title: string;
  published_at: string;
  tag_ids: string[];
  access: PostAccess;
  media: CloneMediaRef[];
  /**
   * EH-060 CMS: draft posts are hidden from visitor gallery until published.
   * Omitted → treated as published (legacy fixtures).
   */
  status?: "draft" | "published";
  /** Lower sorts first in mosaic; null/omit → after pinned posts. */
  feature_order?: number | null;
  /** Optional public cover media_id shown on locked cards (must be in media[] or public). */
  public_cover_media_id?: string | null;
  /** Plain-text body (sanitized on write). Rich HTML is a later slice. */
  body_plain?: string | null;
};

export type EscapeHatchTheme = {
  color_scheme: ColorScheme;
  accent_color?: string;
  paywall_style: PaywallStyle;
  hero: {
    title: string;
    subtitle?: string;
    bio?: string;
  };
  /** Public path to logo/avatar (e.g. `/media/m_public.svg`). */
  logo_path?: string;
  /** Approved type pairing id; defaults to `editorial` when omitted. */
  type_pairing?: TypePairing;
  /** Gallery grid density; defaults to `comfortable` when omitted. */
  gallery_density?: GalleryDensity;
  /** Cover-crop focus for thumbs; defaults to `center` when omitted. */
  cover_crop?: CoverCrop;
  /** Soft-gate paywall message (preview copy only — not production paywall). */
  paywall_message?: string;
  /** Community / Discord CTA (label + href). */
  community_cta?: {
    label: string;
    href: string;
  };
};

export type DemoPersona = {
  id: string;
  label: string;
  /** Soft-gate: tier ids this persona holds (empty = public visitor). */
  tier_ids: string[];
  /**
   * Snapshot of site tier rules for portable preview evaluation.
   * Normalization copies `site.tiers` onto each persona so client call sites
   * `canViewPost(post, persona)` remain catalog-aware without UI edits.
   * Soft-gate only — not authorization authority.
   */
  tier_catalog?: CloneTierRule[];
};

export type SiteBundle = {
  /** Serialized contract version (always present on current output). */
  contract_version: typeof SITE_BUNDLE_CONTRACT_VERSION;
  site_id: string;
  creator_id: string;
  generated_at: string;
  base_url: string;
  creator: {
    display_name: string;
    handle: string;
  };
  theme: EscapeHatchTheme;
  demo_personas: DemoPersona[];
  tiers: CloneTierRule[];
  posts: ClonePostEntry[];
  total_media: number;
};

/** Minimal CloneSiteModel shape accepted by from-clone adapter (current). */
export type CloneSiteModelInput = {
  contract_version: typeof CLONE_SITE_MODEL_CONTRACT_VERSION;
  site_id: string;
  creator_id: string;
  generated_at: string;
  base_url: string;
  tiers: CloneTierRule[];
  posts: ClonePostEntry[];
  total_media: number;
};

export type ExportMediaRecordInput = {
  media_id: string;
  relative_blob_path: string;
  mime_type?: string;
  sha256?: string;
  byte_length?: number;
  exported_at?: string;
};

export type CreatorExportIndexInput = {
  creator_id: string;
  media: Record<string, ExportMediaRecordInput>;
};

/** Catalog entry used by the preview evaluator (mirrors TierRow subset). */
export type PreviewTierEntry = {
  tier_id: string;
  title: string;
  amount_cents?: number | null;
};

// ---------------------------------------------------------------------------
// Validation errors (field paths only — never payload dumps)
// ---------------------------------------------------------------------------

export class ContractValidationError extends Error {
  readonly fieldPath: string;
  readonly code: string;

  constructor(fieldPath: string, message: string, code = "invalid") {
    super(`${fieldPath}: ${message}`);
    this.name = "ContractValidationError";
    this.fieldPath = fieldPath;
    this.code = code;
  }
}

export type ContractIssue = {
  fieldPath: string;
  message: string;
  code: string;
};

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

// ---------------------------------------------------------------------------
// Safe object helpers (own-property only; no prototype pollution)
// ---------------------------------------------------------------------------

const DANGEROUS_KEYS = new Set(["__proto__", "prototype", "constructor"]);

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

/**
 * Slugs are one decoded route segment. Supported grammar is Unicode letters,
 * marks and numbers plus `_`, `-`, and isolated `.` characters. Percent escapes,
 * separators, dot traversal, query/hash delimiters and controls are rejected.
 */
export function isSafeRouteSegment(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 256 &&
    /^[\p{L}\p{M}\p{N}_-]+(?:\.[\p{L}\p{M}\p{N}_-]+)*$/u.test(value) &&
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

function decodeSafeSegment(value: string): string | null {
  try {
    const decoded = decodeURIComponent(value);
    return isSafeId(decoded) ? decoded : null;
  } catch {
    return null;
  }
}

/**
 * Accepted inputs are exactly:
 * - /media/<safe filename>
 * - /api/v1/export/media/<encoded safe creator id>/<encoded safe media id>/content
 */
function isSafeMediaContentPath(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 2048 ||
    value.includes("\\") ||
    value.includes("?") ||
    value.includes("#") ||
    /[\u0000-\u001f]/.test(value)
  ) {
    return false;
  }
  const media = /^\/media\/([^/]+)$/.exec(value);
  if (media) return decodeSafeSegment(media[1]) !== null;
  const relay =
    /^\/api\/v1\/export\/media\/([^/]+)\/([^/]+)\/content$/.exec(value);
  return Boolean(
    relay &&
      decodeSafeSegment(relay[1]) !== null &&
      decodeSafeSegment(relay[2]) !== null
  );
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function expectStringArray(value: unknown, path: string, issues: ContractIssue[]): string[] {
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
// Version parsing
// ---------------------------------------------------------------------------

type SemVerParts = { major: number; minor: number; patch: number };

function parseSemVerSuffix(version: string, prefix: string): SemVerParts | null {
  if (!version.startsWith(prefix)) return null;
  const rest = version.slice(prefix.length);
  if (rest === "0") return { major: 0, minor: 0, patch: 0 };
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(rest);
  if (!m) return null;
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3])
  };
}

function unsupportedVersion(
  path: string,
  found: string,
  supported: string[],
  issues: ContractIssue[]
): void {
  issues.push(
    issue(
      path,
      `unsupported contract version ${JSON.stringify(found)}; supported: ${supported.join(", ")}`,
      "unsupported_version"
    )
  );
}

// ---------------------------------------------------------------------------
// Field parsers (build fresh objects — never return input references)
// ---------------------------------------------------------------------------

function parseAccessLevel(value: unknown, path: string, issues: ContractIssue[]): AccessLevel | null {
  if (typeof value !== "string" || !(ACCESS_LEVELS as readonly string[]).includes(value)) {
    issues.push(
      issue(
        path,
        `expected one of ${ACCESS_LEVELS.join(", ")}`,
        "enum"
      )
    );
    return null;
  }
  return value as AccessLevel;
}

function parseTierMatchMode(
  value: unknown,
  path: string,
  issues: ContractIssue[]
): TierMatchMode | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !(TIER_MATCH_MODES as readonly string[]).includes(value)) {
    issues.push(
      issue(path, `expected one of ${TIER_MATCH_MODES.join(", ")}`, "enum")
    );
    return undefined;
  }
  return value as TierMatchMode;
}

function parseAmountCents(
  value: unknown,
  path: string,
  issues: ContractIssue[]
): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (!isFiniteNumber(value)) {
    issues.push(issue(path, "expected finite number or null", "type"));
    return undefined;
  }
  if (value < 0) {
    issues.push(issue(path, "expected non-negative number", "range"));
    return undefined;
  }
  return value;
}

function parseCloneTierRule(
  value: unknown,
  path: string,
  issues: ContractIssue[]
): CloneTierRule | null {
  if (!isPlainObject(value)) {
    issues.push(issue(path, "expected object", "type"));
    return null;
  }
  const tier_id = ownGet(value, "tier_id");
  const title = ownGet(value, "title");
  const access_level = parseAccessLevel(ownGet(value, "access_level"), `${path}.access_level`, issues);
  if (!isSafeId(tier_id)) {
    issues.push(issue(`${path}.tier_id`, "expected non-empty safe id string", "type"));
  }
  if (!isNonEmptyString(title)) {
    issues.push(issue(`${path}.title`, "expected non-empty string", "type"));
  }
  const campaign_id = ownGet(value, "campaign_id");
  if (campaign_id !== undefined && !isSafeId(campaign_id)) {
    issues.push(issue(`${path}.campaign_id`, "expected safe id string when present", "type"));
  }
  const amount_cents = parseAmountCents(
    ownGet(value, "amount_cents"),
    `${path}.amount_cents`,
    issues
  );
  if (!isSafeId(tier_id) || !isNonEmptyString(title) || !access_level) return null;
  const out: CloneTierRule = {
    tier_id,
    title,
    access_level
  };
  if (isSafeId(campaign_id)) out.campaign_id = campaign_id;
  if (amount_cents !== undefined) out.amount_cents = amount_cents;
  return out;
}

function parsePostAccess(
  value: unknown,
  path: string,
  issues: ContractIssue[]
): PostAccess | null {
  if (!isPlainObject(value)) {
    issues.push(issue(path, "expected object", "type"));
    return null;
  }
  const level = parseAccessLevel(ownGet(value, "level"), `${path}.level`, issues);
  const tier_ids = expectStringArray(ownGet(value, "tier_ids"), `${path}.tier_ids`, issues);
  for (let i = 0; i < tier_ids.length; i++) {
    if (!isSafeId(tier_ids[i])) {
      issues.push(issue(`${path}.tier_ids[${i}]`, "expected non-empty safe id string", "type"));
    }
  }
  const match_mode = parseTierMatchMode(
    ownGet(value, "match_mode"),
    `${path}.match_mode`,
    issues
  );
  if (!level) return null;
  if (level === "public" && tier_ids.length > 0) {
    // Allow but do not require empty; public ignores tier_ids.
  }
  if (level === "tier_gated" && tier_ids.length === 0) {
    issues.push(
      issue(`${path}.tier_ids`, "tier_gated requires at least one tier id", "required")
    );
  }
  const out: PostAccess = { level, tier_ids: [...tier_ids] };
  if (match_mode) out.match_mode = match_mode;
  else if (level === "tier_gated") out.match_mode = "tier_or_higher";
  return out;
}

function parseMediaRef(
  value: unknown,
  path: string,
  issues: ContractIssue[]
): CloneMediaRef | null {
  if (!isPlainObject(value)) {
    issues.push(issue(path, "expected object", "type"));
    return null;
  }
  const media_id = ownGet(value, "media_id");
  const content_path = ownGet(value, "content_path");
  const has_export = ownGet(value, "has_export");
  const mime_type = ownGet(value, "mime_type");
  if (!isSafeId(media_id)) {
    issues.push(issue(`${path}.media_id`, "expected non-empty safe id string", "type"));
  }
  if (!isSafeMediaContentPath(content_path)) {
    issues.push(
      issue(
        `${path}.content_path`,
        "expected safe /media/<filename> or Relay export media path",
        "path"
      )
    );
  }
  if (typeof has_export !== "boolean") {
    issues.push(issue(`${path}.has_export`, "expected boolean", "type"));
  }
  if (mime_type !== undefined && !isNonEmptyString(mime_type)) {
    issues.push(issue(`${path}.mime_type`, "expected non-empty string when present", "type"));
  }
  if (!isSafeId(media_id) || !isSafeMediaContentPath(content_path) || typeof has_export !== "boolean") {
    return null;
  }
  const out: CloneMediaRef = {
    media_id,
    has_export,
    content_path
  };
  if (typeof mime_type === "string") out.mime_type = mime_type;
  return out;
}

function parsePostEntry(
  value: unknown,
  path: string,
  issues: ContractIssue[]
): ClonePostEntry | null {
  if (!isPlainObject(value)) {
    issues.push(issue(path, "expected object", "type"));
    return null;
  }
  const post_id = ownGet(value, "post_id");
  const slug = ownGet(value, "slug");
  const title = ownGet(value, "title");
  const published_at = ownGet(value, "published_at");
  if (!isSafeId(post_id)) {
    issues.push(issue(`${path}.post_id`, "expected non-empty safe id string", "type"));
  }
  if (!isSafeRouteSegment(slug)) {
    issues.push(
      issue(
        `${path}.slug`,
        "expected one safe Unicode route segment using letters, marks, numbers, _, -, or isolated .",
        "path"
      )
    );
  }
  if (!isNonEmptyString(title)) {
    issues.push(issue(`${path}.title`, "expected non-empty string", "type"));
  }
  if (!isIsoDateTime(published_at)) {
    issues.push(issue(`${path}.published_at`, "expected valid ISO date-time", "format"));
  }
  const tag_ids = expectStringArray(ownGet(value, "tag_ids"), `${path}.tag_ids`, issues);
  const access = parsePostAccess(ownGet(value, "access"), `${path}.access`, issues);
  const mediaRaw = ownGet(value, "media");
  if (!Array.isArray(mediaRaw)) {
    issues.push(issue(`${path}.media`, "expected an array", "type"));
  }
  const media: CloneMediaRef[] = [];
  const mediaIds = new Set<string>();
  if (Array.isArray(mediaRaw)) {
    for (let i = 0; i < mediaRaw.length; i++) {
      const m = parseMediaRef(mediaRaw[i], `${path}.media[${i}]`, issues);
      if (m) {
        if (mediaIds.has(m.media_id)) {
          issues.push(
            issue(`${path}.media[${i}].media_id`, "duplicate media id within post", "duplicate")
          );
        } else {
          mediaIds.add(m.media_id);
        }
        media.push(m);
      }
    }
  }
  if (
    !isSafeId(post_id) ||
    !isSafeRouteSegment(slug) ||
    !isNonEmptyString(title) ||
    !isIsoDateTime(published_at) ||
    !access
  ) {
    return null;
  }

  const statusRaw = ownGet(value, "status");
  let status: ClonePostEntry["status"];
  if (statusRaw !== undefined && statusRaw !== null) {
    if (statusRaw !== "draft" && statusRaw !== "published") {
      issues.push(
        issue(`${path}.status`, 'expected "draft" or "published"', "enum")
      );
      return null;
    }
    status = statusRaw;
  }

  const featureRaw = ownGet(value, "feature_order");
  let feature_order: number | null | undefined;
  if (featureRaw !== undefined && featureRaw !== null) {
    if (typeof featureRaw !== "number" || !Number.isFinite(featureRaw)) {
      issues.push(
        issue(`${path}.feature_order`, "expected finite number or null", "type")
      );
      return null;
    }
    feature_order = featureRaw;
  } else if (featureRaw === null) {
    feature_order = null;
  }

  const coverRaw = ownGet(value, "public_cover_media_id");
  let public_cover_media_id: string | null | undefined;
  if (coverRaw !== undefined && coverRaw !== null) {
    if (!isSafeId(coverRaw)) {
      issues.push(
        issue(
          `${path}.public_cover_media_id`,
          "expected non-empty safe id string or null",
          "type"
        )
      );
      return null;
    }
    public_cover_media_id = coverRaw;
  } else if (coverRaw === null) {
    public_cover_media_id = null;
  }

  const bodyRaw = ownGet(value, "body_plain");
  let body_plain: string | null | undefined;
  if (bodyRaw !== undefined && bodyRaw !== null) {
    if (typeof bodyRaw !== "string") {
      issues.push(issue(`${path}.body_plain`, "expected string or null", "type"));
      return null;
    }
    body_plain = bodyRaw;
  } else if (bodyRaw === null) {
    body_plain = null;
  }

  const out: ClonePostEntry = {
    post_id,
    slug,
    title,
    published_at,
    tag_ids: [...tag_ids],
    access,
    media
  };
  if (status) out.status = status;
  if (feature_order !== undefined) out.feature_order = feature_order;
  if (public_cover_media_id !== undefined) {
    out.public_cover_media_id = public_cover_media_id;
  }
  if (body_plain !== undefined) out.body_plain = body_plain;
  return out;
}

function parseTheme(
  value: unknown,
  path: string,
  issues: ContractIssue[]
): EscapeHatchTheme | null {
  if (!isPlainObject(value)) {
    issues.push(issue(path, "expected object", "type"));
    return null;
  }
  const color_scheme = ownGet(value, "color_scheme");
  const paywall_style = ownGet(value, "paywall_style");
  const accent_color = ownGet(value, "accent_color");
  const logo_path = ownGet(value, "logo_path");
  const type_pairing = ownGet(value, "type_pairing");
  const gallery_density = ownGet(value, "gallery_density");
  const cover_crop = ownGet(value, "cover_crop");
  const paywall_message = ownGet(value, "paywall_message");
  const community_cta_raw = ownGet(value, "community_cta");
  const heroRaw = ownGet(value, "hero");
  if (
    typeof color_scheme !== "string" ||
    !(COLOR_SCHEMES as readonly string[]).includes(color_scheme)
  ) {
    issues.push(
      issue(`${path}.color_scheme`, `expected one of ${COLOR_SCHEMES.join(", ")}`, "enum")
    );
  }
  if (
    typeof paywall_style !== "string" ||
    !(PAYWALL_STYLES as readonly string[]).includes(paywall_style)
  ) {
    issues.push(
      issue(`${path}.paywall_style`, `expected one of ${PAYWALL_STYLES.join(", ")}`, "enum")
    );
  }
  if (accent_color !== undefined && !isNonEmptyString(accent_color)) {
    issues.push(issue(`${path}.accent_color`, "expected non-empty string when present", "type"));
  }
  if (logo_path !== undefined && !isNonEmptyString(logo_path)) {
    issues.push(issue(`${path}.logo_path`, "expected non-empty string when present", "type"));
  }
  if (
    type_pairing !== undefined &&
    (typeof type_pairing !== "string" ||
      !(TYPE_PAIRINGS as readonly string[]).includes(type_pairing))
  ) {
    issues.push(
      issue(`${path}.type_pairing`, `expected one of ${TYPE_PAIRINGS.join(", ")}`, "enum")
    );
  }
  if (
    gallery_density !== undefined &&
    (typeof gallery_density !== "string" ||
      !(GALLERY_DENSITIES as readonly string[]).includes(gallery_density))
  ) {
    issues.push(
      issue(
        `${path}.gallery_density`,
        `expected one of ${GALLERY_DENSITIES.join(", ")}`,
        "enum"
      )
    );
  }
  if (
    cover_crop !== undefined &&
    (typeof cover_crop !== "string" ||
      !(COVER_CROPS as readonly string[]).includes(cover_crop))
  ) {
    issues.push(
      issue(`${path}.cover_crop`, `expected one of ${COVER_CROPS.join(", ")}`, "enum")
    );
  }
  if (paywall_message !== undefined && typeof paywall_message !== "string") {
    issues.push(
      issue(`${path}.paywall_message`, "expected string when present", "type")
    );
  }
  let community_cta: EscapeHatchTheme["community_cta"] | undefined;
  if (community_cta_raw !== undefined) {
    if (!isPlainObject(community_cta_raw)) {
      issues.push(issue(`${path}.community_cta`, "expected object when present", "type"));
    } else {
      const ctaLabel = ownGet(community_cta_raw, "label");
      const ctaHref = ownGet(community_cta_raw, "href");
      if (!isNonEmptyString(ctaLabel)) {
        issues.push(
          issue(`${path}.community_cta.label`, "expected non-empty string", "type")
        );
      }
      if (!isNonEmptyString(ctaHref)) {
        issues.push(
          issue(`${path}.community_cta.href`, "expected non-empty string", "type")
        );
      }
      if (isNonEmptyString(ctaLabel) && isNonEmptyString(ctaHref)) {
        community_cta = { label: ctaLabel, href: ctaHref };
      }
    }
  }
  if (!isPlainObject(heroRaw)) {
    issues.push(issue(`${path}.hero`, "expected object", "type"));
    return null;
  }
  const heroTitle = ownGet(heroRaw, "title");
  const subtitle = ownGet(heroRaw, "subtitle");
  const bio = ownGet(heroRaw, "bio");
  if (!isNonEmptyString(heroTitle)) {
    issues.push(issue(`${path}.hero.title`, "expected non-empty string", "type"));
  }
  if (subtitle !== undefined && typeof subtitle !== "string") {
    issues.push(issue(`${path}.hero.subtitle`, "expected string when present", "type"));
  }
  if (bio !== undefined && typeof bio !== "string") {
    issues.push(issue(`${path}.hero.bio`, "expected string when present", "type"));
  }
  if (
    typeof color_scheme !== "string" ||
    !(COLOR_SCHEMES as readonly string[]).includes(color_scheme) ||
    typeof paywall_style !== "string" ||
    !(PAYWALL_STYLES as readonly string[]).includes(paywall_style) ||
    !isNonEmptyString(heroTitle)
  ) {
    return null;
  }
  if (
    (type_pairing !== undefined &&
      (typeof type_pairing !== "string" ||
        !(TYPE_PAIRINGS as readonly string[]).includes(type_pairing))) ||
    (gallery_density !== undefined &&
      (typeof gallery_density !== "string" ||
        !(GALLERY_DENSITIES as readonly string[]).includes(gallery_density))) ||
    (cover_crop !== undefined &&
      (typeof cover_crop !== "string" ||
        !(COVER_CROPS as readonly string[]).includes(cover_crop))) ||
    (paywall_message !== undefined && typeof paywall_message !== "string") ||
    (community_cta_raw !== undefined && community_cta === undefined)
  ) {
    return null;
  }
  const hero: EscapeHatchTheme["hero"] = { title: heroTitle };
  if (typeof subtitle === "string") hero.subtitle = subtitle;
  if (typeof bio === "string") hero.bio = bio;
  const out: EscapeHatchTheme = {
    color_scheme: color_scheme as ColorScheme,
    paywall_style: paywall_style as PaywallStyle,
    hero
  };
  if (typeof accent_color === "string") out.accent_color = accent_color;
  if (typeof logo_path === "string") out.logo_path = logo_path;
  if (typeof type_pairing === "string") out.type_pairing = type_pairing as TypePairing;
  if (typeof gallery_density === "string") {
    out.gallery_density = gallery_density as GalleryDensity;
  }
  if (typeof cover_crop === "string") out.cover_crop = cover_crop as CoverCrop;
  if (typeof paywall_message === "string") out.paywall_message = paywall_message;
  if (community_cta) out.community_cta = community_cta;
  return out;
}

function parseDemoPersona(
  value: unknown,
  path: string,
  issues: ContractIssue[]
): DemoPersona | null {
  if (!isPlainObject(value)) {
    issues.push(issue(path, "expected object", "type"));
    return null;
  }
  const id = ownGet(value, "id");
  const label = ownGet(value, "label");
  if (!isSafeId(id)) {
    issues.push(issue(`${path}.id`, "expected non-empty safe id string", "type"));
  }
  if (!isNonEmptyString(label)) {
    issues.push(issue(`${path}.label`, "expected non-empty string", "type"));
  }
  const tier_ids = expectStringArray(ownGet(value, "tier_ids"), `${path}.tier_ids`, issues);
  for (let i = 0; i < tier_ids.length; i++) {
    if (!isSafeId(tier_ids[i])) {
      issues.push(issue(`${path}.tier_ids[${i}]`, "expected safe id string", "type"));
    }
  }
  const catalogRaw = ownGet(value, "tier_catalog");
  let tier_catalog: CloneTierRule[] | undefined;
  if (catalogRaw !== undefined) {
    tier_catalog = parseTierList(catalogRaw, `${path}.tier_catalog`, issues);
  }
  if (!isSafeId(id) || !isNonEmptyString(label)) return null;
  const out: DemoPersona = { id, label, tier_ids: [...tier_ids] };
  if (tier_catalog) out.tier_catalog = tier_catalog;
  return out;
}

function parseTierList(
  value: unknown,
  path: string,
  issues: ContractIssue[]
): CloneTierRule[] {
  if (!Array.isArray(value)) {
    issues.push(issue(path, "expected an array", "type"));
    return [];
  }
  const out: CloneTierRule[] = [];
  const ids = new Set<string>();
  for (let i = 0; i < value.length; i++) {
    const t = parseCloneTierRule(value[i], `${path}[${i}]`, issues);
    if (t) {
      if (ids.has(t.tier_id)) {
        issues.push(issue(`${path}[${i}].tier_id`, "duplicate tier id", "duplicate"));
      } else {
        ids.add(t.tier_id);
      }
      out.push(t);
    }
  }
  return out;
}

function parsePostList(
  value: unknown,
  path: string,
  issues: ContractIssue[]
): ClonePostEntry[] {
  if (!Array.isArray(value)) {
    issues.push(issue(path, "expected an array", "type"));
    return [];
  }
  const out: ClonePostEntry[] = [];
  const ids = new Set<string>();
  const slugs = new Set<string>();
  for (let i = 0; i < value.length; i++) {
    const p = parsePostEntry(value[i], `${path}[${i}]`, issues);
    if (p) {
      if (ids.has(p.post_id)) {
        issues.push(issue(`${path}[${i}].post_id`, "duplicate post id", "duplicate"));
      } else {
        ids.add(p.post_id);
      }
      if (slugs.has(p.slug)) {
        issues.push(issue(`${path}[${i}].slug`, "duplicate post slug", "duplicate"));
      } else {
        slugs.add(p.slug);
      }
      out.push(p);
    }
  }
  return out;
}

function validateContentGraph(
  tiers: CloneTierRule[],
  posts: ClonePostEntry[],
  totalMedia: unknown,
  issues: ContractIssue[]
): void {
  const tierIds = new Set(tiers.map((tier) => tier.tier_id));
  for (let postIndex = 0; postIndex < posts.length; postIndex++) {
    const post = posts[postIndex];
    if (post.access.level !== "tier_gated") continue;
    for (let tierIndex = 0; tierIndex < post.access.tier_ids.length; tierIndex++) {
      const tierId = post.access.tier_ids[tierIndex];
      if (!tierIds.has(tierId)) {
        // Relay synthetic sentinels are canonical only before access resolution;
        // they are not valid tier_gated requirements in this normalized contract.
        issues.push(
          issue(
            `posts[${postIndex}].access.tier_ids[${tierIndex}]`,
            "tier_gated tier id is absent from tiers catalog",
            "reference"
          )
        );
      }
    }
  }
  const mediaCount = posts.reduce((count, post) => count + post.media.length, 0);
  if (
    isFiniteNumber(totalMedia) &&
    Number.isInteger(totalMedia) &&
    totalMedia >= 0 &&
    totalMedia !== mediaCount
  ) {
    issues.push(
      issue(
        "total_media",
        `expected ${mediaCount} to match post media reference count`,
        "integrity"
      )
    );
  }
}

function cloneTierRules(tiers: CloneTierRule[]): CloneTierRule[] {
  return tiers.map((t) => {
    const out: CloneTierRule = {
      tier_id: t.tier_id,
      title: t.title,
      access_level: t.access_level
    };
    if (t.campaign_id !== undefined) out.campaign_id = t.campaign_id;
    if (t.amount_cents !== undefined) out.amount_cents = t.amount_cents;
    return out;
  });
}

function attachPersonaCatalogs(
  personas: DemoPersona[],
  tiers: CloneTierRule[]
): DemoPersona[] {
  const catalog = cloneTierRules(tiers);
  return personas.map((p) => ({
    id: p.id,
    label: p.label,
    tier_ids: [...p.tier_ids],
    tier_catalog: p.tier_catalog?.length ? cloneTierRules(p.tier_catalog) : cloneTierRules(catalog)
  }));
}

// ---------------------------------------------------------------------------
// Public parse / normalize / serialize
// ---------------------------------------------------------------------------

/**
 * Validate and normalize unknown JSON into the current SiteBundle contract.
 * Accepts legacy unversioned documents (`site-bundle/0`) and upgrades them.
 */
export function parseSiteBundle(input: unknown): SiteBundle {
  const issues: ContractIssue[] = [];
  if (!isPlainObject(input)) {
    throwIssues([issue("(root)", "expected object", "type")]);
  }

  const versionRaw = ownGet(input, "contract_version");
  let version: SiteBundleContractVersion = SITE_BUNDLE_CONTRACT_VERSION_LEGACY;
  if (versionRaw === undefined) {
    version = SITE_BUNDLE_CONTRACT_VERSION_LEGACY;
  } else if (typeof versionRaw !== "string") {
    issues.push(issue("contract_version", "expected string", "type"));
  } else if (versionRaw === SITE_BUNDLE_CONTRACT_VERSION_LEGACY) {
    version = SITE_BUNDLE_CONTRACT_VERSION_LEGACY;
  } else if (versionRaw === SITE_BUNDLE_CONTRACT_VERSION) {
    version = SITE_BUNDLE_CONTRACT_VERSION;
  } else {
    const parts = parseSemVerSuffix(versionRaw, "site-bundle/");
    if (!parts || parts.major > 1) {
      unsupportedVersion(
        "contract_version",
        versionRaw,
        [SITE_BUNDLE_CONTRACT_VERSION_LEGACY, SITE_BUNDLE_CONTRACT_VERSION],
        issues
      );
    } else if (parts.major === 1) {
      // Forward-compatible within major 1 for minor/patch we do not know yet:
      // only accept exact current; unknown 1.x.y fails closed to avoid silent drift.
      unsupportedVersion(
        "contract_version",
        versionRaw,
        [SITE_BUNDLE_CONTRACT_VERSION_LEGACY, SITE_BUNDLE_CONTRACT_VERSION],
        issues
      );
    } else {
      unsupportedVersion(
        "contract_version",
        versionRaw,
        [SITE_BUNDLE_CONTRACT_VERSION_LEGACY, SITE_BUNDLE_CONTRACT_VERSION],
        issues
      );
    }
  }

  const site_id = ownGet(input, "site_id");
  const creator_id = ownGet(input, "creator_id");
  const generated_at = ownGet(input, "generated_at");
  const base_url = ownGet(input, "base_url");
  if (!isSafeId(site_id)) {
    issues.push(issue("site_id", "expected non-empty safe id string", "type"));
  }
  if (!isSafeId(creator_id)) {
    issues.push(issue("creator_id", "expected non-empty safe id string", "type"));
  }
  if (!isIsoDateTime(generated_at)) {
    issues.push(issue("generated_at", "expected valid ISO date-time", "format"));
  }
  if (base_url !== undefined && typeof base_url !== "string") {
    issues.push(issue("base_url", "expected string", "type"));
  }

  const creatorRaw = ownGet(input, "creator");
  let display_name = "";
  let handle = "";
  if (!isPlainObject(creatorRaw)) {
    issues.push(issue("creator", "expected object", "type"));
  } else {
    const dn = ownGet(creatorRaw, "display_name");
    const h = ownGet(creatorRaw, "handle");
    if (!isNonEmptyString(dn)) {
      issues.push(issue("creator.display_name", "expected non-empty string", "type"));
    } else display_name = dn;
    if (!isSafeRouteSegment(h)) {
      issues.push(issue("creator.handle", "expected safe route segment", "path"));
    } else handle = h;
  }

  const theme = parseTheme(ownGet(input, "theme"), "theme", issues);
  const tiers = parseTierList(ownGet(input, "tiers"), "tiers", issues);
  const posts = parsePostList(ownGet(input, "posts"), "posts", issues);

  const personasRaw = ownGet(input, "demo_personas");
  const personas: DemoPersona[] = [];
  const personaIds = new Set<string>();
  if (!Array.isArray(personasRaw)) {
    issues.push(issue("demo_personas", "expected an array", "type"));
  } else {
    for (let i = 0; i < personasRaw.length; i++) {
      const p = parseDemoPersona(personasRaw[i], `demo_personas[${i}]`, issues);
      if (p) {
        if (personaIds.has(p.id)) {
          issues.push(
            issue(`demo_personas[${i}].id`, "duplicate persona id", "duplicate")
          );
        } else {
          personaIds.add(p.id);
        }
        personas.push(p);
      }
    }
  }

  const total_media = ownGet(input, "total_media");
  if (!isFiniteNumber(total_media) || !Number.isInteger(total_media) || total_media < 0) {
    issues.push(issue("total_media", "expected non-negative finite integer", "type"));
  }
  validateContentGraph(tiers, posts, total_media, issues);

  if (issues.length > 0) throwIssues(issues);

  // Fresh normalized current-version object (upgrade path).
  void version;
  return {
    contract_version: SITE_BUNDLE_CONTRACT_VERSION,
    site_id: site_id as string,
    creator_id: creator_id as string,
    generated_at: generated_at as string,
    base_url: typeof base_url === "string" && base_url.length > 0 ? base_url : "/",
    creator: { display_name, handle },
    theme: theme!,
    demo_personas: attachPersonaCatalogs(personas, tiers),
    tiers: cloneTierRules(tiers),
    posts,
    total_media: total_media as number
  };
}

/**
 * Validate and normalize unknown JSON into the current CloneSiteModel input contract.
 * Accepts legacy unversioned documents (`clone-site-model/0`) and upgrades them.
 */
export function parseCloneSiteModelInput(input: unknown): CloneSiteModelInput {
  const issues: ContractIssue[] = [];
  if (!isPlainObject(input)) {
    throwIssues([issue("(root)", "expected object", "type")]);
  }

  const versionRaw = ownGet(input, "contract_version");
  if (versionRaw === undefined) {
    // legacy
  } else if (typeof versionRaw !== "string") {
    issues.push(issue("contract_version", "expected string", "type"));
  } else if (
    versionRaw !== CLONE_SITE_MODEL_CONTRACT_VERSION_LEGACY &&
    versionRaw !== CLONE_SITE_MODEL_CONTRACT_VERSION
  ) {
    unsupportedVersion(
      "contract_version",
      versionRaw,
      [CLONE_SITE_MODEL_CONTRACT_VERSION_LEGACY, CLONE_SITE_MODEL_CONTRACT_VERSION],
      issues
    );
  }

  const site_id = ownGet(input, "site_id");
  const creator_id = ownGet(input, "creator_id");
  const generated_at = ownGet(input, "generated_at");
  const base_url = ownGet(input, "base_url");
  if (!isSafeId(site_id)) {
    issues.push(issue("site_id", "expected non-empty safe id string", "type"));
  }
  if (!isSafeId(creator_id)) {
    issues.push(issue("creator_id", "expected non-empty safe id string", "type"));
  }
  if (!isIsoDateTime(generated_at)) {
    issues.push(issue("generated_at", "expected valid ISO date-time", "format"));
  }
  if (base_url !== undefined && typeof base_url !== "string") {
    issues.push(issue("base_url", "expected string", "type"));
  }

  const tiers = parseTierList(ownGet(input, "tiers"), "tiers", issues);
  const posts = parsePostList(ownGet(input, "posts"), "posts", issues);
  const total_media = ownGet(input, "total_media");
  if (!isFiniteNumber(total_media) || !Number.isInteger(total_media) || total_media < 0) {
    issues.push(issue("total_media", "expected non-negative finite integer", "type"));
  }
  validateContentGraph(tiers, posts, total_media, issues);

  if (issues.length > 0) throwIssues(issues);

  return {
    contract_version: CLONE_SITE_MODEL_CONTRACT_VERSION,
    site_id: site_id as string,
    creator_id: creator_id as string,
    generated_at: generated_at as string,
    base_url: typeof base_url === "string" && base_url.length > 0 ? base_url : "/",
    tiers: cloneTierRules(tiers),
    posts,
    total_media: total_media as number
  };
}

/** Deterministic JSON serialization of a current SiteBundle (stable key order). */
export function serializeSiteBundle(bundle: SiteBundle): string {
  const normalized = parseSiteBundle(bundle);
  return `${JSON.stringify(normalized, null, 2)}\n`;
}

/** Deterministic JSON serialization of current CloneSiteModel input. */
export function serializeCloneSiteModelInput(model: CloneSiteModelInput): string {
  const normalized = parseCloneSiteModelInput(model);
  return `${JSON.stringify(normalized, null, 2)}\n`;
}

// ---------------------------------------------------------------------------
// Preview access evaluator (aligns with src/clone/tier-rules.ts)
// Soft-gate only — not production authorization.
// ---------------------------------------------------------------------------

const FREE_TIER_TITLE_RE = /^\s*(free(\s*tier|\s*member|\s*access|\s*follower)?)\s*$/i;

export function buildTierCatalog(
  tiers: readonly CloneTierRule[] | readonly PreviewTierEntry[]
): Record<string, PreviewTierEntry> {
  const out: Record<string, PreviewTierEntry> = Object.create(null);
  for (const t of tiers) {
    if (!t || typeof t.tier_id !== "string") continue;
    out[t.tier_id] = {
      tier_id: t.tier_id,
      title: t.title,
      amount_cents: t.amount_cents
    };
  }
  return out;
}

/**
 * Detects free-tier rows using amount or title heuristics (tier-rules isFreeTier).
 */
export function isFreeTier(row: PreviewTierEntry | undefined): boolean {
  if (!row) return false;
  const amt = row.amount_cents;
  if (typeof amt === "number" && Number.isFinite(amt)) {
    return amt <= 0;
  }
  return typeof row.title === "string" && FREE_TIER_TITLE_RE.test(row.title);
}

/**
 * Filters entitled tier ids down to paid pledges.
 * Unknown catalog ids are kept (catalog lag — assume paid).
 */
export function paidUserTierIds(
  userTierIds: readonly string[],
  tierCatalog: Record<string, PreviewTierEntry>
): string[] {
  const out: string[] = [];
  for (const id of userTierIds) {
    if (id === RELAY_TIER_PUBLIC || id === RELAY_TIER_ALL_PATRONS) continue;
    const row = Object.prototype.hasOwnProperty.call(tierCatalog, id)
      ? tierCatalog[id]
      : undefined;
    if (row && isFreeTier(row)) continue;
    out.push(id);
  }
  return out;
}

export function tierFloorCents(
  tiers: Record<string, PreviewTierEntry>,
  tierId: string
): number | null {
  if (tierId === RELAY_TIER_PUBLIC) return 0;
  if (tierId === RELAY_TIER_ALL_PATRONS) return 1;
  const row = Object.prototype.hasOwnProperty.call(tiers, tierId)
    ? tiers[tierId]
    : undefined;
  const n = row?.amount_cents;
  if (typeof n === "number" && Number.isFinite(n) && n >= 0) return n;
  return null;
}

export function userMeetsTierGatesWithOrdering(
  requiredTierIds: string[],
  userTierIds: string[],
  tiers: Record<string, PreviewTierEntry>
): boolean {
  if (requiredTierIds.length === 0) return false;
  for (const req of requiredTierIds) {
    const reqFloor = tierFloorCents(tiers, req);
    for (const uid of userTierIds) {
      if (uid === req) return true;
      const uFloor = tierFloorCents(tiers, uid);
      if (reqFloor !== null && uFloor !== null && uFloor >= reqFloor) return true;
    }
  }
  return false;
}

function userMeetsTierGatesExact(
  requiredTierIds: string[],
  userTierIds: string[]
): boolean {
  return requiredTierIds.some((t) => userTierIds.includes(t));
}

/**
 * Runtime preview access check aligning with Patreon PE / tier-rules semantics.
 *
 * Compatibility: when `tierCatalog` is omitted or empty, behaves like v0 Escape Hatch
 * (any non-empty user tier list satisfies member_only; tier_gated is exact id match).
 * When catalog data exists, member_only requires a paid tier; tier_gated uses
 * tier-or-higher ordering when floors are known (unless match_mode is `exact`).
 */
export function canAccessPost(
  postAccess: { level: AccessLevel; tier_ids: string[]; match_mode?: TierMatchMode },
  userTierIds: readonly string[],
  tierCatalog?: Record<string, PreviewTierEntry>
): boolean {
  if (postAccess.level === "public") return true;

  const catalogKeys =
    tierCatalog && typeof tierCatalog === "object"
      ? Object.keys(tierCatalog)
      : [];
  const hasCatalog = catalogKeys.length > 0;

  const paid = hasCatalog
    ? paidUserTierIds(userTierIds, tierCatalog!)
    : [...userTierIds];

  if (postAccess.level === "member_only") return paid.length > 0;

  if (hasCatalog && postAccess.tier_ids.length > 0) {
    // Explicit Free Tier requirement: grant exact id match on raw user tiers.
    if (postAccess.tier_ids.some((t) => isFreeTier(tierCatalog![t]))) {
      if (postAccess.tier_ids.some((t) => userTierIds.includes(t))) return true;
    }
    const mode = postAccess.match_mode ?? "tier_or_higher";
    if (mode === "exact") {
      return userMeetsTierGatesExact(postAccess.tier_ids, paid);
    }
    return userMeetsTierGatesWithOrdering(postAccess.tier_ids, paid, tierCatalog!);
  }

  return postAccess.tier_ids.some((t) => userTierIds.includes(t));
}

/**
 * Preview helper for demo personas.
 * Uses `persona.tier_catalog` when present (filled by parseSiteBundle), otherwise
 * optional explicit catalog argument, otherwise legacy no-catalog behavior.
 */
export function canViewPost(
  post: ClonePostEntry,
  persona: DemoPersona,
  tiers?: readonly CloneTierRule[]
): boolean {
  const catalogSource =
    tiers ??
    persona.tier_catalog ??
    undefined;
  const catalog =
    catalogSource && catalogSource.length > 0
      ? buildTierCatalog(catalogSource)
      : undefined;
  return canAccessPost(post.access, persona.tier_ids, catalog);
}
