/**
 * PMD-040 — Platform first-party telemetry event contract.
 * @see docs/platform-first-party-event-contract.md
 */

export const FIRST_PARTY_EVENT_VERSION = "1.0" as const;

export type FirstPartyEventImplementationStatus =
  | "live"
  | "partial"
  | "planned";

export type FirstPartyEventStorageTarget =
  | "relay_engagement_events"
  | "platform_telemetry_events"
  | "domain_table";

export type FirstPartyEventDefinition = {
  /** Canonical snake_case event name (e.g. page_view). */
  name: string;
  version: typeof FIRST_PARTY_EVENT_VERSION;
  storage: FirstPartyEventStorageTarget;
  /** Maps to prisma RelayEngagementEventType when storage is relay_engagement_events. */
  legacyRelayEngagementType?: "gallery_view" | "profile_view" | "reveal_interaction";
  requiredFields: readonly string[];
  optionalFields: readonly string[];
  /** Must never appear in payload or envelope. */
  forbiddenFields: readonly string[];
  privacyRules: readonly string[];
  dedupePosture: string;
  sourceSurfaces: readonly string[];
  dashboardMetricKeys: readonly string[];
  implementationStatus: FirstPartyEventImplementationStatus;
};

/** Fields allowed on every platform telemetry envelope. */
export const PLATFORM_TELEMETRY_ENVELOPE_FIELDS = [
  "event_id",
  "event_name",
  "occurred_at",
  "producer",
  "version",
  "trace_id",
  "session_key",
  "actor_key",
  "payload"
] as const;

export const PLATFORM_TELEMETRY_FORBIDDEN_FIELDS = [
  "email",
  "email_norm",
  "password",
  "ip_address",
  "ip_inet",
  "user_agent_raw",
  "patreon_user_id",
  "display_name",
  "full_name",
  "phone"
] as const;

export const FIRST_PARTY_EVENT_DEFINITIONS: FirstPartyEventDefinition[] = [
  {
    name: "page_view",
    version: FIRST_PARTY_EVENT_VERSION,
    storage: "platform_telemetry_events",
    requiredFields: ["occurred_at", "surface", "path"],
    optionalFields: ["session_key", "actor_key", "creator_id", "referrer_group", "auth_state"],
    forbiddenFields: PLATFORM_TELEMETRY_FORBIDDEN_FIELDS,
    privacyRules: [
      "Store path as route template or normalized path — no query strings with tokens.",
      "auth_state is anonymous | authenticated only.",
      "session_key and actor_key are opaque hashes — never raw cookies or JWTs."
    ],
    dedupePosture:
      "At-least-once emit; rollup dedupes by (event_name, session_key, path, occurred_at minute bucket).",
    sourceSurfaces: [
      "web: all studio and patron routes (client beacon)",
      "web: public profile / gallery visitor shell"
    ],
    dashboardMetricKeys: ["traffic.page_views", "traffic.unique_visitors"],
    implementationStatus: "planned"
  },
  {
    name: "session_start",
    version: FIRST_PARTY_EVENT_VERSION,
    storage: "platform_telemetry_events",
    requiredFields: ["occurred_at", "session_key"],
    optionalFields: ["actor_key", "surface", "auth_state"],
    forbiddenFields: PLATFORM_TELEMETRY_FORBIDDEN_FIELDS,
    privacyRules: [
      "session_key is server-issued opaque token hash — not the raw session token.",
      "Do not log IP or user agent in telemetry payload."
    ],
    dedupePosture:
      "One session_start per session_key; replays ignored via unique (session_key, event_name).",
    sourceSurfaces: [
      "api: POST /api/v1/auth/* session issue",
      "web: first authenticated page load after login"
    ],
    dashboardMetricKeys: ["activity.session_starts", "activity.dau", "activity.wau", "activity.mau"],
    implementationStatus: "planned"
  },
  {
    name: "profile_view",
    version: FIRST_PARTY_EVENT_VERSION,
    storage: "relay_engagement_events",
    legacyRelayEngagementType: "profile_view",
    requiredFields: ["occurred_at", "creator_id"],
    optionalFields: ["session_key", "post_id", "media_id"],
    forbiddenFields: PLATFORM_TELEMETRY_FORBIDDEN_FIELDS,
    privacyRules: [
      "Creator-scoped engagement only — no patron identity in row.",
      "session_key optional opaque visitor key for unique counts."
    ],
    dedupePosture:
      "At-least-once append; visitor profile_view deduped in rollups by (creator_id, session_key, UTC day).",
    sourceSurfaces: ["api: GET /api/v1/gallery/facets?visitor=true"],
    dashboardMetricKeys: ["traffic.profile_views"],
    implementationStatus: "live"
  },
  {
    name: "gallery_view",
    version: FIRST_PARTY_EVENT_VERSION,
    storage: "relay_engagement_events",
    legacyRelayEngagementType: "gallery_view",
    requiredFields: ["occurred_at", "creator_id"],
    optionalFields: ["session_key", "post_id", "media_id"],
    forbiddenFields: PLATFORM_TELEMETRY_FORBIDDEN_FIELDS,
    privacyRules: [
      "Creator-scoped engagement only.",
      "First page only for list endpoint (no cursor) to limit noise."
    ],
    dedupePosture:
      "At-least-once append; first-page gallery_view per session per creator per UTC day in rollups.",
    sourceSurfaces: [
      "api: GET /api/v1/gallery/items (visitor, no cursor)",
      "api: GET /api/v1/gallery/post-detail?visitor=true"
    ],
    dashboardMetricKeys: ["traffic.gallery_views", "content.post_views"],
    implementationStatus: "live"
  },
  {
    name: "feed_open",
    version: FIRST_PARTY_EVENT_VERSION,
    storage: "platform_telemetry_events",
    requiredFields: ["occurred_at", "actor_key"],
    optionalFields: ["session_key", "surface"],
    forbiddenFields: PLATFORM_TELEMETRY_FORBIDDEN_FIELDS,
    privacyRules: [
      "actor_key is internal account or membership id — never email.",
      "Patron-scoped; no cross-tenant creator ids required."
    ],
    dedupePosture:
      "At-least-once; rollup counts distinct (actor_key, UTC day) for DAU proxy.",
    sourceSurfaces: ["web: /patron/feed initial mount"],
    dashboardMetricKeys: ["activity.feed_opens"],
    implementationStatus: "live"
  },
  {
    name: "post_view",
    version: FIRST_PARTY_EVENT_VERSION,
    storage: "platform_telemetry_events",
    requiredFields: ["occurred_at", "creator_id", "post_id"],
    optionalFields: ["session_key", "actor_key", "surface"],
    forbiddenFields: PLATFORM_TELEMETRY_FORBIDDEN_FIELDS,
    privacyRules: [
      "post_id and creator_id are internal Relay ids.",
      "No comment body or patron display name in payload."
    ],
    dedupePosture:
      "At-least-once; content rollups group by post_id with optional session dedupe.",
    sourceSurfaces: [
      "web: /patron/feed/post/[creatorId]/[postId]",
      "web: patron feed card impression (future batch beacon)"
    ],
    dashboardMetricKeys: ["activity.post_views", "content.post_views"],
    implementationStatus: "live"
  },
  {
    name: "post_impression",
    version: FIRST_PARTY_EVENT_VERSION,
    storage: "platform_telemetry_events",
    requiredFields: ["occurred_at", "creator_id", "post_id", "surface"],
    optionalFields: ["session_key", "actor_key", "media_id", "feed_source"],
    forbiddenFields: PLATFORM_TELEMETRY_FORBIDDEN_FIELDS,
    privacyRules: [
      "Card impression only; internal post and creator ids are allowed.",
      "No raw viewport size, user agent, or IP payload."
    ],
    dedupePosture:
      "At-least-once on card render; rollups dedupe by (session_key, post_id, surface, UTC hour).",
    sourceSurfaces: ["web: patron feed card render", "web: public gallery tile render"],
    dashboardMetricKeys: ["activity.post_views", "content.post_views"],
    implementationStatus: "live"
  },
  {
    name: "media_view",
    version: FIRST_PARTY_EVENT_VERSION,
    storage: "platform_telemetry_events",
    requiredFields: ["occurred_at", "creator_id", "post_id", "media_id", "surface"],
    optionalFields: ["session_key", "actor_key"],
    forbiddenFields: PLATFORM_TELEMETRY_FORBIDDEN_FIELDS,
    privacyRules: [
      "Media ids are internal Relay ids.",
      "Do not include media URL, filenames, or viewer identity in payload."
    ],
    dedupePosture:
      "At-least-once when media becomes active; rollups dedupe by (session_key, media_id, UTC hour).",
    sourceSurfaces: ["web: patron feed media carousel", "web: post detail gallery"],
    dashboardMetricKeys: ["activity.post_views", "content.post_views"],
    implementationStatus: "live"
  },
  {
    name: "cta_clicked",
    version: FIRST_PARTY_EVENT_VERSION,
    storage: "platform_telemetry_events",
    requiredFields: ["occurred_at", "surface", "interaction"],
    optionalFields: ["creator_id", "post_id", "media_id", "session_key", "actor_key", "target"],
    forbiddenFields: PLATFORM_TELEMETRY_FORBIDDEN_FIELDS,
    privacyRules: [
      "CTA target must be an enum-ish string such as connect_patreon, comment_open, snip_open.",
      "Do not store outbound URLs with query strings."
    ],
    dedupePosture:
      "At-least-once click event; rollups count by surface + interaction with optional post/media grouping.",
    sourceSurfaces: ["web: feed buttons", "web: gallery locked/tier CTA", "web: Patreon connect links"],
    dashboardMetricKeys: ["content.post_reveals"],
    implementationStatus: "live"
  },
  {
    name: "post_reveal",
    version: FIRST_PARTY_EVENT_VERSION,
    storage: "relay_engagement_events",
    legacyRelayEngagementType: "reveal_interaction",
    requiredFields: ["occurred_at", "creator_id"],
    optionalFields: ["post_id", "media_id", "session_key"],
    forbiddenFields: PLATFORM_TELEMETRY_FORBIDDEN_FIELDS,
    privacyRules: [
      "Tier reveal interaction only — no entitlement tier names tied to patron identity in row."
    ],
    dedupePosture:
      "At-least-once append; rollups count reveal_interaction per post/media.",
    sourceSurfaces: ["web: gallery tier reveal interaction", "api: visitor post-detail reveal"],
    dashboardMetricKeys: ["content.post_reveals"],
    implementationStatus: "live"
  },
  {
    name: "creator_onboarded",
    version: FIRST_PARTY_EVENT_VERSION,
    storage: "domain_table",
    requiredFields: ["occurred_at", "creator_id"],
    optionalFields: ["onboarding_step"],
    forbiddenFields: PLATFORM_TELEMETRY_FORBIDDEN_FIELDS,
    privacyRules: ["Derived from creator_onboarding_states — no PII columns."],
    dedupePosture: "Domain row is source of truth; one onboarded milestone per creator.",
    sourceSurfaces: ["api: onboarding completion handler"],
    dashboardMetricKeys: ["creator_health.onboarded", "growth.new_creators"],
    implementationStatus: "planned"
  },
  {
    name: "patreon_connected",
    version: FIRST_PARTY_EVENT_VERSION,
    storage: "domain_table",
    requiredFields: ["occurred_at", "creator_id"],
    optionalFields: ["oauth_purpose"],
    forbiddenFields: PLATFORM_TELEMETRY_FORBIDDEN_FIELDS,
    privacyRules: ["OAuth credential health only — no access tokens in event payload."],
    dedupePosture: "Emit on first healthy creator ingest credential per creator_id.",
    sourceSurfaces: ["api: POST /api/v1/auth/patreon/exchange", "api: OAuth health transition"],
    dashboardMetricKeys: ["creator_health.patreon_connected", "growth.patreon_creator_connections"],
    implementationStatus: "live"
  },
  {
    name: "import_completed",
    version: FIRST_PARTY_EVENT_VERSION,
    storage: "domain_table",
    requiredFields: ["occurred_at", "creator_id"],
    optionalFields: ["import_job_id", "posts_written"],
    forbiddenFields: PLATFORM_TELEMETRY_FORBIDDEN_FIELDS,
    privacyRules: ["Import job ids only — no Patreon member payloads."],
    dedupePosture: "One row per completed import job id.",
    sourceSurfaces: ["ingest: Patreon import batch completion"],
    dashboardMetricKeys: ["creator_health.imports_completed"],
    implementationStatus: "live"
  },
  {
    name: "post_published",
    version: FIRST_PARTY_EVENT_VERSION,
    storage: "domain_table",
    requiredFields: ["occurred_at", "creator_id", "post_id"],
    optionalFields: ["source"],
    forbiddenFields: PLATFORM_TELEMETRY_FORBIDDEN_FIELDS,
    privacyRules: ["Relay-native posts table is source — no media bytes in payload."],
    dedupePosture: "One event per post_id publish transition.",
    sourceSurfaces: ["api: relay post publish", "api: manual import post write"],
    dashboardMetricKeys: ["creator_health.posts_published"],
    implementationStatus: "live"
  },
  {
    name: "follow_created",
    version: FIRST_PARTY_EVENT_VERSION,
    storage: "domain_table",
    requiredFields: ["occurred_at", "creator_id"],
    optionalFields: ["patron_membership_id"],
    forbiddenFields: PLATFORM_TELEMETRY_FORBIDDEN_FIELDS,
    privacyRules: [
      "patron_membership_id is internal TenantMembership id — never Patreon user id."
    ],
    dedupePosture: "patron_follows unique (patron_membership_id, relay_creator_id) is dedupe key.",
    sourceSurfaces: ["api: patron follow create"],
    dashboardMetricKeys: ["growth.new_follows", "patron_health.total_follows"],
    implementationStatus: "planned"
  },
  {
    name: "favorite_created",
    version: FIRST_PARTY_EVENT_VERSION,
    storage: "platform_telemetry_events",
    requiredFields: ["occurred_at", "creator_id"],
    optionalFields: ["post_id", "media_id", "target_kind", "target_id", "actor_key", "session_key", "surface"],
    forbiddenFields: PLATFORM_TELEMETRY_FORBIDDEN_FIELDS,
    privacyRules: ["Internal ids only."],
    dedupePosture: "At-least-once after favorite success; domain table remains the write dedupe key.",
    sourceSurfaces: ["web: patron favorite success", "api: patron favorite create"],
    dashboardMetricKeys: ["patron_health.favorites"],
    implementationStatus: "live"
  },
  {
    name: "snip_created",
    version: FIRST_PARTY_EVENT_VERSION,
    storage: "platform_telemetry_events",
    requiredFields: ["occurred_at", "creator_id", "post_id", "media_id"],
    optionalFields: ["collection_id", "actor_key", "session_key", "surface"],
    forbiddenFields: PLATFORM_TELEMETRY_FORBIDDEN_FIELDS,
    privacyRules: ["Internal ids only; no collection title or user-provided text."],
    dedupePosture:
      "At-least-once after collection entry success; domain table prevents duplicate entries.",
    sourceSurfaces: ["web: snip-to-collection success", "api: patron collection entry create"],
    dashboardMetricKeys: ["patron_health.favorites"],
    implementationStatus: "live"
  },
  {
    name: "post_liked",
    version: FIRST_PARTY_EVENT_VERSION,
    storage: "platform_telemetry_events",
    requiredFields: ["occurred_at", "creator_id", "post_id", "surface"],
    optionalFields: ["actor_key", "session_key", "media_id"],
    forbiddenFields: PLATFORM_TELEMETRY_FORBIDDEN_FIELDS,
    privacyRules: ["Internal ids only; no display names or comment bodies."],
    dedupePosture: "At-least-once on like toggle to active; rollups dedupe by actor/session + post.",
    sourceSurfaces: ["web: patron feed like button", "web: post detail like button"],
    dashboardMetricKeys: ["patron_health.favorites"],
    implementationStatus: "live"
  },
  {
    name: "comment_created",
    version: FIRST_PARTY_EVENT_VERSION,
    storage: "platform_telemetry_events",
    requiredFields: ["occurred_at", "creator_id", "post_id"],
    optionalFields: ["comment_id", "media_id", "actor_key", "session_key", "surface"],
    forbiddenFields: [...PLATFORM_TELEMETRY_FORBIDDEN_FIELDS, "comment_body", "body"],
    privacyRules: [
      "Never store comment text in telemetry payload.",
      "comment_id is internal Relay comment row id."
    ],
    dedupePosture: "One telemetry emit per relay_comments insert.",
    sourceSurfaces: ["web: relay comment create success", "api: relay comment create"],
    dashboardMetricKeys: ["patron_health.comments"],
    implementationStatus: "live"
  },
  {
    name: "comment_reaction_created",
    version: FIRST_PARTY_EVENT_VERSION,
    storage: "platform_telemetry_events",
    requiredFields: ["occurred_at", "creator_id", "post_id", "comment_id", "reaction_kind"],
    optionalFields: ["actor_key", "session_key", "surface"],
    forbiddenFields: [...PLATFORM_TELEMETRY_FORBIDDEN_FIELDS, "comment_body", "body"],
    privacyRules: [
      "Never store comment text in telemetry payload.",
      "reaction_kind is one of the UI reaction enums."
    ],
    dedupePosture:
      "At-least-once after reaction toggle; comment reaction table is source of truth for current state.",
    sourceSurfaces: ["web: relay comment reaction success"],
    dashboardMetricKeys: ["patron_health.comments"],
    implementationStatus: "live"
  },
  {
    name: "analytics_viewed",
    version: FIRST_PARTY_EVENT_VERSION,
    storage: "platform_telemetry_events",
    requiredFields: ["occurred_at", "creator_id", "actor_key"],
    optionalFields: ["session_key"],
    forbiddenFields: PLATFORM_TELEMETRY_FORBIDDEN_FIELDS,
    privacyRules: ["Creator studio route — actor is authenticated creator account."],
    dedupePosture: "At-least-once page mount; rollups dedupe per creator per UTC day.",
    sourceSurfaces: ["web: /analytics mount"],
    dashboardMetricKeys: ["creator_health.analytics_views"],
    implementationStatus: "live"
  },
  {
    name: "action_center_used",
    version: FIRST_PARTY_EVENT_VERSION,
    storage: "platform_telemetry_events",
    requiredFields: ["occurred_at", "creator_id", "actor_key"],
    optionalFields: ["session_key", "surface", "interaction", "recommendation_id"],
    forbiddenFields: PLATFORM_TELEMETRY_FORBIDDEN_FIELDS,
    privacyRules: ["Creator studio Action Center — internal ids only."],
    dedupePosture:
      "At-least-once mount and interaction events; rollups count views and accept/dismiss actions.",
    sourceSurfaces: [
      "web: /action-center mount",
      "web: Action Center accept/dismiss"
    ],
    dashboardMetricKeys: ["creator_health.action_center_cards"],
    implementationStatus: "live"
  }
];

export function getFirstPartyEventDefinition(name: string): FirstPartyEventDefinition | undefined {
  return FIRST_PARTY_EVENT_DEFINITIONS.find((def) => def.name === name);
}

export function listFirstPartyEventNames(): string[] {
  return FIRST_PARTY_EVENT_DEFINITIONS.map((def) => def.name);
}

export function validateFirstPartyEventPayload(args: {
  eventName: string;
  payload: Record<string, unknown>;
}): { valid: boolean; errors: string[] } {
  const def = getFirstPartyEventDefinition(args.eventName);
  const errors: string[] = [];
  if (!def) {
    return { valid: false, errors: [`unknown event: ${args.eventName}`] };
  }

  for (const field of def.requiredFields) {
    if (args.payload[field] === undefined || args.payload[field] === null) {
      errors.push(`missing required field: ${field}`);
    }
  }

  for (const forbidden of def.forbiddenFields) {
    if (forbidden in args.payload) {
      errors.push(`forbidden field present: ${forbidden}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

export type FirstPartyIngestRequest = {
  event_name: string;
  occurred_at: string;
  producer?: string;
  version?: string;
  session_key?: string;
  actor_key?: string;
  creator_id?: string;
  payload?: Record<string, unknown>;
};

export type NormalizedFirstPartyIngest = {
  eventName: string;
  occurredAt: Date;
  producer: string | null;
  version: string;
  sessionKey: string | null;
  actorKey: string | null;
  creatorId: string | null;
  payload: Record<string, unknown>;
  definition: FirstPartyEventDefinition;
};

const ENVELOPE_FORBIDDEN = new Set<string>(PLATFORM_TELEMETRY_FORBIDDEN_FIELDS);

function readTrimmedString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function parseOccurredAt(raw: unknown): Date | null {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms);
}

export function isIngestibleFirstPartyEvent(def: FirstPartyEventDefinition): boolean {
  return def.storage === "platform_telemetry_events" || def.storage === "relay_engagement_events";
}

export function listIngestibleFirstPartyEventNames(): string[] {
  return FIRST_PARTY_EVENT_DEFINITIONS.filter(isIngestibleFirstPartyEvent).map((def) => def.name);
}

/**
 * Validates a POST body for the first-party ingestion endpoint.
 * Merges envelope fields with nested payload before contract checks.
 */
export function validateFirstPartyIngestRequest(body: unknown): {
  valid: boolean;
  errors: string[];
  normalized?: NormalizedFirstPartyIngest;
} {
  const errors: string[] = [];
  if (body == null || typeof body !== "object" || Array.isArray(body)) {
    return { valid: false, errors: ["request body must be a JSON object"] };
  }

  const record = body as Record<string, unknown>;
  const eventName = readTrimmedString(record.event_name);
  if (!eventName) {
    errors.push("missing required field: event_name");
  }

  const occurredAt = parseOccurredAt(record.occurred_at);
  if (!occurredAt) {
    errors.push("missing or invalid field: occurred_at (ISO-8601 required)");
  }

  for (const key of Object.keys(record)) {
    if (ENVELOPE_FORBIDDEN.has(key)) {
      errors.push(`forbidden field present: ${key}`);
    }
  }

  const payloadRaw = record.payload;
  let payload: Record<string, unknown> = {};
  if (payloadRaw === undefined) {
    payload = {};
  } else if (payloadRaw != null && typeof payloadRaw === "object" && !Array.isArray(payloadRaw)) {
    payload = payloadRaw as Record<string, unknown>;
  } else {
    errors.push("payload must be an object when provided");
  }

  if (errors.length > 0 || !eventName || !occurredAt) {
    return { valid: false, errors };
  }

  const def = getFirstPartyEventDefinition(eventName);
  if (!def) {
    return { valid: false, errors: [`unknown event: ${eventName}`] };
  }

  if (!isIngestibleFirstPartyEvent(def)) {
    return {
      valid: false,
      errors: [`event ${eventName} is domain-sourced and cannot be ingested via this endpoint`]
    };
  }

  const creatorId =
    readTrimmedString(payload.creator_id) ?? readTrimmedString(record.creator_id) ?? null;
  const sessionKey =
    readTrimmedString(payload.session_key) ?? readTrimmedString(record.session_key) ?? null;
  const actorKey =
    readTrimmedString(payload.actor_key) ?? readTrimmedString(record.actor_key) ?? null;

  const mergedPayload: Record<string, unknown> = {
    ...payload,
    occurred_at: occurredAt.toISOString(),
    ...(creatorId ? { creator_id: creatorId } : {}),
    ...(sessionKey ? { session_key: sessionKey } : {}),
    ...(actorKey ? { actor_key: actorKey } : {})
  };

  const payloadValidation = validateFirstPartyEventPayload({
    eventName,
    payload: mergedPayload
  });
  errors.push(...payloadValidation.errors);

  const version = readTrimmedString(record.version) ?? FIRST_PARTY_EVENT_VERSION;
  if (version !== FIRST_PARTY_EVENT_VERSION) {
    errors.push(`unsupported version: ${version}`);
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    errors: [],
    normalized: {
      eventName,
      occurredAt,
      producer: readTrimmedString(record.producer) ?? null,
      version,
      sessionKey,
      actorKey,
      creatorId,
      payload: mergedPayload,
      definition: def
    }
  };
}
