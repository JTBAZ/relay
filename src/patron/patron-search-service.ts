/**
 * @fileoverview Patron experience module patron-search-service.ts — global search over followed creators.
 * @see {@link ../jsdoc-core-entities.ts}
 * @see prisma/schema.prisma Post, PostVersion, PatronFollow, PatronEntitlementSnapshot
 * @security-audit-required Locked hits must not expose gated media URLs or patron-only descriptions.
 */
import type { CreatorProfile, PrismaClient, Tier } from "@prisma/client";
import { MediaUpstreamStatus, PostUpstreamStatus } from "@prisma/client";
import type { TierRow } from "../ingest/canonical-store.js";
import {
  evaluateTierRules,
  resolvePostAccessLevel,
  canAccessPost
} from "../clone/tier-rules.js";
import {
  effectiveTags,
  stripHtmlForSearch
} from "../gallery/query.js";
import { galleryOverridesRootFromRows } from "../gallery/overrides-store-db.js";
import { loadHiddenPostIdsByCreator } from "../gallery/hidden-post-ids.js";
import { loadMaturePostIdsByCreator } from "../gallery/mature-post-ids.js";
import {
  resolvePostTierDisplayLabel
} from "../gallery/tier-display-label.js";
import type { GalleryItem } from "../gallery/types.js";
import type {
  PatronSearchHitJson,
  PatronSearchListParams,
  PatronSearchMatchField,
  PatronSearchMediaFilter,
  PatronSearchMediaType,
  PatronSearchResultJson,
  PatronSearchSortMode
} from "./patron-search-types.js";
import {
  PATRON_SEARCH_DEFAULT_LIMIT,
  PATRON_SEARCH_MAX_LIMIT,
  PATRON_SEARCH_MAX_QUERY_LENGTH,
  PATRON_SEARCH_MIN_QUERY_LENGTH
} from "./patron-search-types.js";

const MAX_POSTS_SCAN = 800;

export type PatronSearchValidationCode = "QUERY_TOO_SHORT" | "QUERY_TOO_LONG";

export class PatronSearchValidationError extends Error {
  readonly code: PatronSearchValidationCode;

  constructor(code: PatronSearchValidationCode, message: string) {
    super(message);
    this.name = "PatronSearchValidationError";
    this.code = code;
  }
}

export type AssemblePatronSearchArgs = {
  prisma: PrismaClient;
  patronMembershipId: string;
  hideMatureContent?: boolean;
} & PatronSearchListParams;

type CursorPayload = { t: number; id: string };

type InternalRow = {
  postId: string;
  creatorId: string;
  publishedAt: Date;
  title: string;
  description: string | null;
  tierIds: string[];
  tagIds: string[];
  mediaType: PatronSearchMediaType;
  primaryMimeType: string | null;
  coverContentPath: string | null;
  isPublicPost: boolean;
  mediaId: string;
  matchFields: PatronSearchMatchField[];
  allowed: boolean;
};

function encodeCursor(row: { publishedAt: Date; id: string }): string {
  const p: CursorPayload = { t: row.publishedAt.getTime(), id: row.id };
  return Buffer.from(JSON.stringify(p), "utf8").toString("base64url");
}

function decodeCursor(raw: string | null | undefined): CursorPayload | null {
  if (!raw?.trim()) return null;
  try {
    const json = Buffer.from(raw.trim(), "base64url").toString("utf8");
    const p = JSON.parse(json) as CursorPayload;
    if (typeof p?.t !== "number" || typeof p?.id !== "string") return null;
    return p;
  } catch {
    return null;
  }
}

function isNewer(
  a: { publishedAt: Date; id: string },
  b: { publishedAt: Date; id: string }
): boolean {
  const at = a.publishedAt.getTime();
  const bt = b.publishedAt.getTime();
  if (at !== bt) return at > bt;
  return a.id > b.id;
}

function tierToRow(t: Tier): TierRow {
  return {
    tier_id: t.relayTierId,
    creator_id: t.creatorId,
    campaign_id: t.campaignId ?? undefined,
    title: t.title,
    amount_cents: t.amountCents ?? undefined,
    upstream_updated_at: t.upstreamUpdatedAt.toISOString(),
    version_seq: t.versionSeq
  };
}

function mimeToMediaType(mime: string | null | undefined): PatronSearchMediaType {
  if (!mime) return "writing";
  const m = mime.toLowerCase();
  if (m.startsWith("image/")) return "photo";
  if (m.startsWith("audio/")) return "audio";
  if (m.startsWith("video/")) return "video";
  return "writing";
}

const CREATOR_AVATAR_PLACEHOLDER = "/placeholder.svg?height=40&width=40";

function creatorIdentityFromProfile(
  cp: CreatorProfile | undefined,
  relayCreatorId: string
): { handle: string; displayName: string; avatarUrl: string } {
  const handle = cp?.username?.trim() || relayCreatorId.slice(0, 12);
  const displayName =
    cp?.displayName?.trim() ||
    cp?.username?.trim() ||
    cp?.publicSlug?.trim() ||
    "Creator";
  const avatarUrl = cp?.avatarUrl?.trim() || CREATOR_AVATAR_PLACEHOLDER;
  return { handle, displayName, avatarUrl };
}

function excerptFromDescription(raw: string | null | undefined, title: string): string {
  const s = stripHtmlForSearch(raw ?? "").replace(/\s+/g, " ").trim();
  if (!s) return title;
  return s.length > 220 ? `${s.slice(0, 217)}…` : s;
}

/** Normalizes and validates a patron search query for route/service callers. */
export function normalizePatronSearchQuery(raw: string): string {
  const q = raw.trim();
  if (q.length < PATRON_SEARCH_MIN_QUERY_LENGTH) {
    throw new PatronSearchValidationError(
      "QUERY_TOO_SHORT",
      `Query must be at least ${PATRON_SEARCH_MIN_QUERY_LENGTH} characters.`
    );
  }
  if (q.length > PATRON_SEARCH_MAX_QUERY_LENGTH) {
    throw new PatronSearchValidationError(
      "QUERY_TOO_LONG",
      `Query must be at most ${PATRON_SEARCH_MAX_QUERY_LENGTH} characters.`
    );
  }
  return q;
}

/** Dedupes trimmed creator ids from route/query input. */
export function normalizePatronSearchCreatorIds(raw: readonly string[] | undefined): string[] {
  if (!raw?.length) return [];
  return [...new Set(raw.map((s) => s.trim()).filter(Boolean))];
}

/**
 * Resolves query text vs creator-only browse mode.
 * Browse is allowed when `creator_ids` is non-empty and the query is blank.
 */
export function resolvePatronSearchInput(
  rawQ: string,
  creatorIds: readonly string[]
): { q: string; browse: boolean; creator_ids: string[] } {
  const ids = normalizePatronSearchCreatorIds(creatorIds);
  const trimmed = rawQ.trim();
  if (trimmed.length === 0) {
    if (ids.length === 0) {
      throw new PatronSearchValidationError(
        "QUERY_TOO_SHORT",
        `Query must be at least ${PATRON_SEARCH_MIN_QUERY_LENGTH} characters.`
      );
    }
    return { q: "", browse: true, creator_ids: ids };
  }
  return { q: normalizePatronSearchQuery(rawQ), browse: false, creator_ids: ids };
}

/** Parses repeated `creator_id` and optional comma-separated `creator_ids` query params. */
export function parsePatronSearchCreatorIdsFromQuery(
  rawCreatorId: string | string[] | undefined,
  rawCreatorIdsCsv: string | undefined
): string[] {
  const collected: string[] = [];
  if (typeof rawCreatorIdsCsv === "string" && rawCreatorIdsCsv.trim()) {
    collected.push(...rawCreatorIdsCsv.split(","));
  }
  if (Array.isArray(rawCreatorId)) {
    collected.push(...rawCreatorId);
  } else if (typeof rawCreatorId === "string") {
    collected.push(rawCreatorId);
  }
  return normalizePatronSearchCreatorIds(collected);
}

function scopeToFollowedCreators(followedIds: string[], requestedIds: string[]): string[] {
  if (requestedIds.length === 0) return followedIds;
  const followed = new Set(followedIds);
  return requestedIds.filter((id) => followed.has(id));
}

function searchTokens(raw: string): string[] {
  return raw
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => t.toLowerCase());
}

type CreatorSearchIdentity = {
  handle: string;
  displayName: string;
  publicSlug: string;
};

function creatorSearchIdentity(
  cp: CreatorProfile | undefined,
  relayCreatorId: string
): CreatorSearchIdentity {
  const { handle, displayName } = creatorIdentityFromProfile(cp, relayCreatorId);
  return {
    handle,
    displayName,
    publicSlug: cp?.publicSlug?.trim() ?? ""
  };
}

function tokenMatchesCreator(token: string, identity: CreatorSearchIdentity): boolean {
  const hay = [identity.handle, identity.displayName, identity.publicSlug].map((s) =>
    s.toLowerCase()
  );
  return hay.some((h) => h.length > 0 && h.includes(token));
}

function tokenMatchesPost(token: string, item: GalleryItem): boolean {
  const titleLower = item.title.toLowerCase();
  const postIdLower = item.post_id.toLowerCase();
  const mediaIdLower = item.media_id.toLowerCase();
  const descHay = stripHtmlForSearch(item.description).toLowerCase();
  return (
    titleLower.includes(token) ||
    item.tag_ids.some((t) => t.toLowerCase().includes(token)) ||
    descHay.includes(token) ||
    item.collection_theme_tag_ids.some((t) => t.toLowerCase().includes(token)) ||
    postIdLower.includes(token) ||
    mediaIdLower.includes(token)
  );
}

/** Post-level AND search plus creator handle / display name / slug (patron global search). */
function patronSearchPostMatches(
  item: GalleryItem,
  identity: CreatorSearchIdentity,
  raw: string
): boolean {
  const tokens = searchTokens(raw);
  if (tokens.length === 0) return true;
  for (const token of tokens) {
    if (!tokenMatchesCreator(token, identity) && !tokenMatchesPost(token, item)) {
      return false;
    }
  }
  return true;
}

/** Normalizes `media` / `media_filter` query values for the route layer. */
export function normalizePatronSearchMediaFilter(
  raw: string | undefined
): PatronSearchMediaFilter {
  switch (raw?.trim().toLowerCase()) {
    case "photo":
    case "image":
      return "photo";
    case "video":
      return "video";
    case "writing":
    case "text":
      return "writing";
    default:
      return "all";
  }
}

/** Normalizes `sort` query values for the route layer. */
export function normalizePatronSearchSort(raw: string | undefined): PatronSearchSortMode {
  return raw?.trim().toLowerCase() === "oldest" ? "oldest" : "newest";
}

function rowMatchesMediaFilter(
  row: InternalRow,
  mediaFilter: PatronSearchMediaFilter
): boolean {
  if (mediaFilter === "all") return true;
  return row.mediaType === mediaFilter;
}

function computeMatchFields(
  item: GalleryItem,
  identity: CreatorSearchIdentity,
  raw: string
): PatronSearchMatchField[] {
  const tokens = searchTokens(raw);
  if (tokens.length === 0) {
    return [];
  }

  const matched = new Set<PatronSearchMatchField>();

  for (const token of tokens) {
    if (tokenMatchesCreator(token, identity)) matched.add("creator");
    if (item.title.toLowerCase().includes(token)) matched.add("title");
    if (item.tag_ids.some((t) => t.toLowerCase().includes(token))) matched.add("tag");
    const descHay = stripHtmlForSearch(item.description).toLowerCase();
    if (descHay.includes(token)) matched.add("description");
    if (item.collection_theme_tag_ids.some((t) => t.toLowerCase().includes(token))) {
      matched.add("theme_tag");
    }
    if (item.post_id.toLowerCase().includes(token)) matched.add("post_id");
    if (item.media_id.toLowerCase().includes(token)) matched.add("media_id");
  }

  return [...matched];
}

function toSearchGalleryItem(args: {
  creatorId: string;
  postId: string;
  mediaId: string;
  title: string;
  description: string | null;
  tagIds: string[];
}): GalleryItem {
  return {
    media_id: args.mediaId,
    post_id: args.postId,
    title: args.title,
    description: args.description ?? "",
    published_at: "",
    tag_ids: args.tagIds,
    tier_ids: [],
    has_export: false,
    processing_status: "READY",
    export_status: "missing",
    content_url_path: "",
    preview_url_path: "",
    thumb_url_path: "",
    visibility: "visible",
    collection_ids: [],
    collection_theme_tag_ids: []
  };
}

function paginateRows(
  rows: InternalRow[],
  cursor: CursorPayload | null,
  limit: number,
  sort: PatronSearchSortMode
): { page: InternalRow[]; next_cursor: string | null } {
  let start = 0;
  if (cursor) {
    const cursorRow = { publishedAt: new Date(cursor.t), id: cursor.id };
    start = rows.findIndex((row) => {
      const r = { publishedAt: row.publishedAt, id: row.postId };
      return sort === "newest" ? isNewer(cursorRow, r) : isNewer(r, cursorRow);
    });
    if (start === -1) start = rows.length;
  }

  const page = rows.slice(start, start + limit);
  let next_cursor: string | null = null;
  if (page.length === limit && start + limit < rows.length) {
    const tail = page[page.length - 1]!;
    next_cursor = encodeCursor({ publishedAt: tail.publishedAt, id: tail.postId });
  }
  return { page, next_cursor };
}

function rowToHit(
  row: InternalRow,
  profileByCreator: Map<string, CreatorProfile>,
  tiersByCreator: Map<string, Record<string, TierRow>>
): PatronSearchHitJson {
  const prof = profileByCreator.get(row.creatorId);
  const { handle, displayName, avatarUrl } = creatorIdentityFromProfile(prof, row.creatorId);
  const tierCatalog = tiersByCreator.get(row.creatorId) ?? {};
  const tierLabel = resolvePostTierDisplayLabel({
    tierIds: row.tierIds,
    tierCatalog,
    isPublicPost: row.isPublicPost
  });
  const locked = !row.allowed;

  return {
    creator_id: row.creatorId,
    post_id: row.postId,
    creator: {
      id: row.creatorId,
      handle,
      display_name: displayName,
      avatar_url: avatarUrl
    },
    title: row.title,
    excerpt: locked ? row.title : excerptFromDescription(row.description, row.title),
    published_at: row.publishedAt.toISOString(),
    media_type: row.mediaType,
    cover_url_path: locked ? null : row.coverContentPath,
    tag_ids: row.tagIds,
    tier_label: tierLabel,
    viewer_entitlement: locked ? "locked" : "visible",
    match_fields: row.matchFields
  };
}

function emptySection(): PatronSearchResultJson["accessible"] {
  return { items: [], next_cursor: null };
}

/**
 * PE-S (PGS-02) — entitlement-aware cross-creator search for followed creators.
 * Uses the canonical search kernel (`itemMatchesFreeTextQuery`) at post granularity.
 */
export async function assemblePatronSearch(
  args: AssemblePatronSearchArgs
): Promise<PatronSearchResultJson> {
  const requestedCreatorIds = normalizePatronSearchCreatorIds(args.creator_ids);
  const { q, browse, creator_ids: appliedCreatorIds } = resolvePatronSearchInput(
    args.q,
    requestedCreatorIds
  );
  const section = args.section ?? "accessible";
  const mediaFilter = args.media_filter ?? "all";
  const sort = args.sort ?? "newest";
  const limit = Math.min(
    Math.max(1, args.limit ?? PATRON_SEARCH_DEFAULT_LIMIT),
    PATRON_SEARCH_MAX_LIMIT
  );
  const cursor = decodeCursor(args.cursor ?? null);

  const follows = await args.prisma.patronFollow.findMany({
    where: { patronMembershipId: args.patronMembershipId },
    select: { relayCreatorId: true }
  });
  const followedIds = [...new Set(follows.map((f) => f.relayCreatorId))];
  const scopedCreatorIds = scopeToFollowedCreators(followedIds, appliedCreatorIds);

  if (followedIds.length === 0 || scopedCreatorIds.length === 0) {
    return {
      query: q,
      creator_ids: appliedCreatorIds,
      media_filter: mediaFilter,
      sort,
      accessible: emptySection(),
      locked: emptySection()
    };
  }

  const hideMatureContent = args.hideMatureContent === true;

  const [snapshots, tierRows, profiles, hiddenPostIdsByCreator, maturePostIdsByCreator, overrideRows, postsRaw] =
    await Promise.all([
      args.prisma.patronEntitlementSnapshot.findMany({
        where: {
          patronMembershipId: args.patronMembershipId,
          relayCreatorId: { in: scopedCreatorIds }
        }
      }),
      args.prisma.tier.findMany({
        where: { creatorId: { in: scopedCreatorIds } }
      }),
      args.prisma.creatorProfile.findMany({
        where: { tenant: { relayCreatorId: { in: scopedCreatorIds } } },
        include: { tenant: { select: { relayCreatorId: true } } }
      }),
      loadHiddenPostIdsByCreator(args.prisma, scopedCreatorIds),
      hideMatureContent
        ? loadMaturePostIdsByCreator(args.prisma, scopedCreatorIds)
        : Promise.resolve(new Map<string, Set<string>>()),
      args.prisma.postOverride.findMany({
        where: { creatorId: { in: scopedCreatorIds } }
      }),
      args.prisma.post.findMany({
        where: {
          creatorId: { in: scopedCreatorIds },
          upstreamStatus: PostUpstreamStatus.active
        },
        include: {
          versions: {
            orderBy: { versionSeq: "desc" },
            take: 1
          },
          mediaAssets: {
            where: { upstreamStatus: MediaUpstreamStatus.active },
            take: 1,
            orderBy: { currentIngestedAt: "desc" }
          }
        },
        orderBy: { createdAt: "desc" },
        take: MAX_POSTS_SCAN
      })
    ]);

  const snapByCreator = new Map(snapshots.map((s) => [s.relayCreatorId, s]));
  const tiersByCreator = new Map<string, Record<string, TierRow>>();
  for (const t of tierRows) {
    const cat = tiersByCreator.get(t.creatorId) ?? {};
    cat[t.relayTierId] = tierToRow(t);
    tiersByCreator.set(t.creatorId, cat);
  }
  const profileByCreator = new Map(
    profiles
      .filter((p) => p.tenant.relayCreatorId)
      .map((p) => [p.tenant.relayCreatorId as string, p])
  );
  const overrides = galleryOverridesRootFromRows(overrideRows);

  const accessibleRows: InternalRow[] = [];
  const lockedRows: InternalRow[] = [];

  for (const post of postsRaw) {
    const v = post.versions[0];
    if (!v) continue;
    if (hiddenPostIdsByCreator.get(post.creatorId)?.has(post.id)) {
      continue;
    }
    if (hideMatureContent && maturePostIdsByCreator.get(post.creatorId)?.has(post.id)) {
      continue;
    }

    const media = post.mediaAssets[0];
    const mediaId = media?.id ?? `post_only_${post.id}`;
    const effectiveTagIds = effectiveTags(
      v.tagIds,
      post.creatorId,
      post.id,
      overrides
    );
    const searchable = toSearchGalleryItem({
      creatorId: post.creatorId,
      postId: post.id,
      mediaId,
      title: v.title,
      description: v.description ?? null,
      tagIds: effectiveTagIds
    });

    const creatorIdentity = creatorSearchIdentity(
      profileByCreator.get(post.creatorId),
      post.creatorId
    );

    if (!browse && !patronSearchPostMatches(searchable, creatorIdentity, q)) {
      continue;
    }

    const matchFields = browse ? [] : computeMatchFields(searchable, creatorIdentity, q);
    const snap = snapByCreator.get(post.creatorId);
    const entitled = snap?.entitledTierIds ?? [];
    const tierCatalog = tiersByCreator.get(post.creatorId) ?? {};
    const tierRules = evaluateTierRules(tierCatalog);
    const postAccess = resolvePostAccessLevel(v.tierIds, tierRules);
    const allowed =
      post.isPublic || canAccessPost(postAccess, entitled, tierCatalog);

    const mime = media?.currentMimeType;
    const hasExportedBlob = Boolean(media?.id && media.currentStorageKey);
    const coverContentPath =
      allowed && hasExportedBlob
        ? `/api/v1/export/media/${encodeURIComponent(post.creatorId)}/${encodeURIComponent(media!.id)}/content`
        : null;

    const row: InternalRow = {
      postId: post.id,
      creatorId: post.creatorId,
      publishedAt: v.publishedAt,
      title: v.title,
      description: v.description ?? null,
      tierIds: v.tierIds,
      tagIds: effectiveTagIds,
      mediaType: mimeToMediaType(mime),
      primaryMimeType: mime ?? null,
      coverContentPath,
      isPublicPost: post.isPublic,
      mediaId,
      matchFields,
      allowed
    };

    if (!rowMatchesMediaFilter(row, mediaFilter)) {
      continue;
    }

    if (allowed) {
      accessibleRows.push(row);
    } else {
      lockedRows.push(row);
    }
  }

  const sortRows = (rows: InternalRow[]) => {
    rows.sort((a, b) => {
      const ar = { publishedAt: a.publishedAt, id: a.postId };
      const br = { publishedAt: b.publishedAt, id: b.postId };
      if (sort === "newest") {
        if (isNewer(ar, br)) return -1;
        if (isNewer(br, ar)) return 1;
        return 0;
      }
      if (isNewer(ar, br)) return 1;
      if (isNewer(br, ar)) return -1;
      return 0;
    });
  };
  sortRows(accessibleRows);
  sortRows(lockedRows);

  const paginateAccessible = !args.cursor || section === "accessible";
  const paginateLocked = !args.cursor || section === "locked";

  const accessiblePage = paginateAccessible
    ? paginateRows(accessibleRows, section === "accessible" ? cursor : null, limit, sort)
    : { page: [] as InternalRow[], next_cursor: null as string | null };

  const lockedPage = paginateLocked
    ? paginateRows(lockedRows, section === "locked" ? cursor : null, limit, sort)
    : { page: [] as InternalRow[], next_cursor: null as string | null };

  return {
    query: q,
    creator_ids: appliedCreatorIds,
    media_filter: mediaFilter,
    sort,
    accessible: {
      items: accessiblePage.page.map((row) =>
        rowToHit(row, profileByCreator, tiersByCreator)
      ),
      next_cursor: accessiblePage.next_cursor
    },
    locked: {
      items: lockedPage.page.map((row) =>
        rowToHit(row, profileByCreator, tiersByCreator)
      ),
      next_cursor: lockedPage.next_cursor
    }
  };
}

export {
  PATRON_SEARCH_DEFAULT_LIMIT,
  PATRON_SEARCH_MAX_LIMIT,
  PATRON_SEARCH_MIN_QUERY_LENGTH,
  PATRON_SEARCH_MAX_QUERY_LENGTH
};
