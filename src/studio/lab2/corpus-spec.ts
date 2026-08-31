/**
 * Studio Lab 2 corpus spec — validator, canonical hash, and deterministic authoring (RC-P2-T01).
 * On-disk fixture: tests/fixtures/studio-lab2-corpus.json
 *
 * @see docs/studio/relay-command-mcp-build-plans/LAB2-TEST-GROUND-CONTRACT.md
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSequenceToken, resolveNumberedSequence } from "../command/sequence.js";

export const STUDIO_LAB2_LABEL = "studio-lab2-corpus-v1" as const;
export const STUDIO_LAB2_CREATOR_ID = "rcx_studio_lab2" as const;
export const STUDIO_LAB2_ACCOUNT_KEY = "studio_lab2" as const;
export const STUDIO_LAB2_EMAIL = "studio-lab2@relay.test" as const;
export const STUDIO_LAB2_CAMPAIGN_ID = "sl2_campaign" as const;
export const STUDIO_LAB2_DEV_PASSWORD_ENV = "RELAY_STUDIO_LAB2_DEV_PASSWORD" as const;
export const STUDIO_LAB2_DEFAULT_DEV_PASSWORD = "studio-lab2-dev-only" as const;

export const STUDIO_LAB2_SERIES_HERO_ACADEMY = "sl2_series_hero_academy" as const;
export const STUDIO_LAB2_SERIES_STARLIGHT = "sl2_series_starlight_harbor" as const;
export const STUDIO_LAB2_SERIES_ACADEMY_STUDIES = "sl2_series_academy_studies" as const;

export const STUDIO_LAB2_TAGS = [
  { tag_id: "sl2_tag_watercolor", label: "watercolor" },
  { tag_id: "sl2_tag_comic", label: "comic" },
  { tag_id: "sl2_tag_sketch", label: "sketch" },
  { tag_id: "sl2_tag_wip", label: "wip" },
  { tag_id: "sl2_tag_landscape", label: "landscape" }
] as const;

export const STUDIO_LAB2_TIER_ID = "sl2_tier_studio" as const;

/** Baseline Lab 2 home-screen stack. Not Hero Academy / watercolor (those stay command-created). */
export const STUDIO_LAB2_DEFAULT_COLLECTION_ID = "sl2_col_photo_studies" as const;
export const STUDIO_LAB2_DEFAULT_COLLECTION_TITLE = "Photo Studies" as const;
export const STUDIO_LAB2_DEFAULT_COLLECTION_POST_IDS = [
  "sl2_st_01",
  "sl2_st_02",
  "sl2_st_03",
  "sl2_st_04",
  "sl2_st_05"
] as const;

export const STUDIO_LAB2_METRIC_PATTERNS = [
  "timing_cluster",
  "ordinary",
  "weak_promo",
  "forbidden_primary"
] as const;
export type StudioLab2MetricPattern = (typeof STUDIO_LAB2_METRIC_PATTERNS)[number];

export type StudioLab2MediaStub = {
  media_id: string;
  role: "original" | "cover" | "attachment";
  visibility: "public" | "gated";
  mime_type: string;
};

export type StudioLab2CorpusPost = {
  post_id: string;
  title: string;
  description: string;
  source: "PATREON" | "RELAY";
  published_at: string;
  is_public: boolean;
  access: "public" | "gated";
  series_id: string | null;
  series_sort_order: number | null;
  tag_ids: string[];
  media_type: "photo" | "writing" | "video";
  media: StudioLab2MediaStub[];
  tier_ids: string[];
};

export type StudioLab2DistributionRow = {
  post_id: string;
  destination: "x";
  attempt_status: "posted";
  external_url: string;
  external_id: string;
};

export type StudioLab2MetricRow = {
  post_id: string;
  pattern: StudioLab2MetricPattern;
  weekday: string | null;
  local_window: string | null;
};

export type StudioLab2EvalBlock = {
  min_published_posts: number;
  hero_academy_series_id: string;
  hero_academy_ordered_ids: string[];
  hero_academy_missing_page: number;
  hero_academy_duplicate_page: number;
  hero_academy_duplicate_ids: [string, string];
  watercolor_post_ids: string[];
  already_on_x_post_ids: string[];
  imported_revise_post_id: string;
  native_revise_post_id: string;
  gated_original_post_ids: string[];
  academy_ambiguous_labels: string[];
  pagination_requires_second_page: boolean;
};

export type StudioLab2Corpus = {
  version: 1;
  label: typeof STUDIO_LAB2_LABEL;
  fixture_hash: string;
  creator: {
    relayCreatorId: typeof STUDIO_LAB2_CREATOR_ID;
    accountKey: typeof STUDIO_LAB2_ACCOUNT_KEY;
    email: typeof STUDIO_LAB2_EMAIL;
    displayName: string;
    campaignId: typeof STUDIO_LAB2_CAMPAIGN_ID;
    devPasswordEnv: typeof STUDIO_LAB2_DEV_PASSWORD_ENV;
    defaultDevPassword: typeof STUDIO_LAB2_DEFAULT_DEV_PASSWORD;
  };
  tags: Array<{ tag_id: string; label: string }>;
  tiers: Array<{ relay_tier_id: string; title: string; amount_cents: number }>;
  posts: StudioLab2CorpusPost[];
  distribution: StudioLab2DistributionRow[];
  metrics: StudioLab2MetricRow[];
  eval: StudioLab2EvalBlock;
};

function isoUtc(year: number, monthIndex: number, day: number, hour = 15, minute = 0): string {
  return new Date(Date.UTC(year, monthIndex, day, hour, minute, 0, 0)).toISOString();
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function canonicalize(value: unknown, omitTopHash = false): unknown {
  if (Array.isArray(value)) return value.map((v) => canonicalize(v, false));
  if (value && typeof value === "object") {
    const rec = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(rec).sort()) {
      if (omitTopHash && key === "fixture_hash") continue;
      out[key] = canonicalize(rec[key], false);
    }
    return out;
  }
  return value;
}

export function hashStudioLab2Corpus(corpus: Omit<StudioLab2Corpus, "fixture_hash"> | StudioLab2Corpus): string {
  const canonical = canonicalize(corpus, true);
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

function photoMedia(postId: string): StudioLab2MediaStub[] {
  return [
    {
      media_id: `${postId}_media`,
      role: "original",
      visibility: "public",
      mime_type: "image/jpeg"
    }
  ];
}

function post(partial: StudioLab2CorpusPost): StudioLab2CorpusPost {
  return partial;
}

function heroAcademyTitle(page: number): string {
  switch (page) {
    case 1:
      return "Hero Academy Page 1";
    case 2:
      return "Hero Academy Page 2";
    case 3:
      return "Hero Academy Part 3";
    case 4:
      return "Hero Academy Pg. 4";
    case 5:
      return "Hero Academy P. 5";
    case 6:
      return "Hero Academy page 06";
    default:
      return `Hero Academy Page ${page}`;
  }
}

function heroAcademyPages(): number[] {
  const pages: number[] = [];
  for (let n = 1; n <= 20; n += 1) {
    if (n === 17) continue;
    pages.push(n);
  }
  return pages;
}

/** Deterministic 112-post Lab 2 corpus (hash filled by {@link authorStudioLab2Corpus}). */
export function authorStudioLab2Corpus(): StudioLab2Corpus {
  const posts: StudioLab2CorpusPost[] = [];

  posts.push(
    post({
      post_id: "sl2_ha_cover",
      title: "Hero Academy Cover",
      description: "Hero Academy cover plate.",
      source: "PATREON",
      published_at: isoUtc(2025, 0, 1, 12, 0),
      is_public: true,
      access: "public",
      series_id: STUDIO_LAB2_SERIES_HERO_ACADEMY,
      series_sort_order: 0,
      tag_ids: ["sl2_tag_comic"],
      media_type: "photo",
      media: photoMedia("sl2_ha_cover"),
      tier_ids: []
    })
  );

  for (const n of heroAcademyPages()) {
    const postId = `sl2_ha_p${pad2(n)}`;
    posts.push(
      post({
        post_id: postId,
        title: heroAcademyTitle(n),
        description: `Hero Academy page ${n}.`,
        source: "PATREON",
        published_at: isoUtc(2025, 0, n, 15, 0),
        is_public: true,
        access: "public",
        series_id: STUDIO_LAB2_SERIES_HERO_ACADEMY,
        series_sort_order: n,
        tag_ids: ["sl2_tag_comic"],
        media_type: "photo",
        media: photoMedia(postId),
        tier_ids: []
      })
    );
  }

  posts.push(
    post({
      post_id: "sl2_ha_p08_dup",
      title: "Hero Academy Page 8",
      description: "Duplicate page-8 label (later published_at).",
      source: "PATREON",
      published_at: isoUtc(2025, 0, 8, 18, 0),
      is_public: true,
      access: "public",
      series_id: STUDIO_LAB2_SERIES_HERO_ACADEMY,
      series_sort_order: 8,
      tag_ids: ["sl2_tag_comic"],
      media_type: "photo",
      media: photoMedia("sl2_ha_p08_dup"),
      tier_ids: []
    })
  );

  for (let n = 1; n <= 12; n += 1) {
    const postId = `sl2_sh_p${pad2(n)}`;
    posts.push(
      post({
        post_id: postId,
        title: `Starlight Harbor Part ${n}`,
        description: `Starlight Harbor part ${n}.`,
        source: "PATREON",
        published_at: isoUtc(2025, 1, n, 15, 0),
        is_public: true,
        access: "public",
        series_id: STUDIO_LAB2_SERIES_STARLIGHT,
        series_sort_order: n,
        tag_ids: ["sl2_tag_comic"],
        media_type: "photo",
        media: photoMedia(postId),
        tier_ids: []
      })
    );
  }

  for (let n = 1; n <= 10; n += 1) {
    const postId = `sl2_nm_${pad2(n)}`;
    const titled =
      n % 2 === 1 ? `Night Market Pg. ${n}` : `Night Market sketch ${n}`;
    posts.push(
      post({
        post_id: postId,
        title: titled,
        description: `Night Market sketch ${n}.`,
        source: "PATREON",
        published_at: isoUtc(2025, 2, n, 16, 0),
        is_public: true,
        access: "public",
        series_id: null,
        series_sort_order: null,
        tag_ids: ["sl2_tag_sketch"],
        media_type: "photo",
        media: photoMedia(postId),
        tier_ids: []
      })
    );
  }

  const watercolorIds: string[] = [];
  for (let n = 1; n <= 18; n += 1) {
    const postId = `sl2_wc_${pad2(n)}`;
    watercolorIds.push(postId);
    posts.push(
      post({
        post_id: postId,
        title: `Watercolor landscape ${n}`,
        description: `Watercolor landscape study ${n}.`,
        source: "PATREON",
        published_at: isoUtc(2025, 3, n, 19, 0),
        is_public: true,
        access: "public",
        series_id: null,
        series_sort_order: null,
        tag_ids: ["sl2_tag_watercolor", "sl2_tag_landscape"],
        media_type: "photo",
        media: photoMedia(postId),
        tier_ids: []
      })
    );
  }

  for (let n = 1; n <= 8; n += 1) {
    const postId = `sl2_car_${pad2(n)}`;
    posts.push(
      post({
        post_id: postId,
        title: `Carousel WIP ${n}`,
        description: `Multi-media WIP carousel ${n}.`,
        source: "PATREON",
        published_at: isoUtc(2025, 4, n, 14, 0),
        is_public: true,
        access: "public",
        series_id: null,
        series_sort_order: null,
        tag_ids: ["sl2_tag_wip"],
        media_type: "photo",
        media: [1, 2, 3].map((slot) => ({
          media_id: `${postId}_m${slot}`,
          role: "attachment" as const,
          visibility: "public" as const,
          mime_type: "image/jpeg"
        })),
        tier_ids: []
      })
    );
  }

  const gatedIds: string[] = [];
  for (let n = 1; n <= 8; n += 1) {
    const postId = `sl2_gt_${pad2(n)}`;
    gatedIds.push(postId);
    posts.push(
      post({
        post_id: postId,
        title: `Gated studio shot ${n}`,
        description: `Gated original with public cover ${n}.`,
        source: "PATREON",
        published_at: isoUtc(2025, 5, n, 13, 0),
        is_public: false,
        access: "gated",
        series_id: null,
        series_sort_order: null,
        tag_ids: [],
        media_type: "photo",
        media: [
          {
            media_id: `${postId}_cover`,
            role: "cover",
            visibility: "public",
            mime_type: "image/jpeg"
          },
          {
            media_id: `${postId}_orig`,
            role: "original",
            visibility: "gated",
            mime_type: "image/png"
          }
        ],
        tier_ids: [STUDIO_LAB2_TIER_ID]
      })
    );
  }

  for (let n = 1; n <= 6; n += 1) {
    const postId = `sl2_rn_${pad2(n)}`;
    posts.push(
      post({
        post_id: postId,
        title: `Relay native sketch ${n}`,
        description: `Relay-native sketch ${n}.`,
        source: "RELAY",
        published_at: isoUtc(2025, 6, n, 11, 0),
        is_public: true,
        access: "public",
        series_id: null,
        series_sort_order: null,
        tag_ids: ["sl2_tag_sketch"],
        media_type: "photo",
        media: photoMedia(postId),
        tier_ids: []
      })
    );
  }

  for (let n = 1; n <= 4; n += 1) {
    const postId = `sl2_as_${pad2(n)}`;
    posts.push(
      post({
        post_id: postId,
        title: `Academy Studies Page ${n}`,
        description: `Academy Studies page ${n}.`,
        source: "PATREON",
        published_at: isoUtc(2025, 7, n, 10, 0),
        is_public: true,
        access: "public",
        series_id: STUDIO_LAB2_SERIES_ACADEMY_STUDIES,
        series_sort_order: n,
        tag_ids: ["sl2_tag_sketch"],
        media_type: "photo",
        media: photoMedia(postId),
        tier_ids: []
      })
    );
  }

  const standaloneTypes: Array<StudioLab2CorpusPost["media_type"]> = [
    ...Array.from({ length: 15 }, () => "photo" as const),
    ...Array.from({ length: 5 }, () => "writing" as const),
    ...Array.from({ length: 5 }, () => "video" as const)
  ];
  for (let n = 1; n <= 25; n += 1) {
    const postId = `sl2_st_${pad2(n)}`;
    const mediaType = standaloneTypes[n - 1]!;
    const mime =
      mediaType === "writing" ? "text/plain" : mediaType === "video" ? "video/mp4" : "image/jpeg";
    posts.push(
      post({
        post_id: postId,
        title: `Standalone ${mediaType} ${n}`,
        description: `Mixed standalone ${n}.`,
        source: "PATREON",
        published_at: isoUtc(2025, 8, n, 12, 0),
        is_public: true,
        access: "public",
        series_id: null,
        series_sort_order: null,
        tag_ids: [],
        media_type: mediaType,
        media: [
          {
            media_id: `${postId}_media`,
            role: "original",
            visibility: "public",
            mime_type: mime
          }
        ],
        tier_ids: []
      })
    );
  }

  const alreadyOnX = ["sl2_ha_p01", "sl2_ha_p02", "sl2_ha_p03", "sl2_ha_p04", "sl2_ha_p05", "sl2_ha_p06"];
  const distribution: StudioLab2DistributionRow[] = alreadyOnX.map((postId) => ({
    post_id: postId,
    destination: "x",
    attempt_status: "posted",
    external_url: `https://x.example/${postId}`,
    external_id: `x_${postId}`
  }));

  const haOrdered = [
    "sl2_ha_cover",
    ...heroAcademyPages().map((n) => `sl2_ha_p${pad2(n)}`)
  ];

  const metrics: StudioLab2MetricRow[] = [];
  const metricFor = (post_id: string, pattern: StudioLab2MetricPattern): StudioLab2MetricRow => ({
    post_id,
    pattern,
    weekday: pattern === "timing_cluster" ? "Tuesday" : null,
    local_window: pattern === "timing_cluster" ? "19:00-21:00" : null
  });
  for (const id of watercolorIds.slice(0, 6)) metrics.push(metricFor(id, "timing_cluster"));
  metrics.push(metricFor("sl2_ha_p07", "timing_cluster"));
  metrics.push(metricFor("sl2_ha_p08", "timing_cluster"));
  for (const id of ["sl2_st_01", "sl2_st_02", "sl2_st_03", "sl2_st_04", "sl2_st_05", "sl2_st_06", "sl2_st_07", "sl2_st_08", "sl2_st_09", "sl2_st_10"]) {
    metrics.push(metricFor(id, "weak_promo"));
  }
  metrics.push(metricFor("sl2_st_23", "forbidden_primary"));
  metrics.push(metricFor("sl2_st_24", "forbidden_primary"));
  metrics.push(metricFor("sl2_st_25", "forbidden_primary"));
  const metriced = new Set(metrics.map((m) => m.post_id));
  for (const p of posts) {
    if (!metriced.has(p.post_id)) metrics.push(metricFor(p.post_id, "ordinary"));
  }

  const withoutHash: Omit<StudioLab2Corpus, "fixture_hash"> = {
    version: 1,
    label: STUDIO_LAB2_LABEL,
    creator: {
      relayCreatorId: STUDIO_LAB2_CREATOR_ID,
      accountKey: STUDIO_LAB2_ACCOUNT_KEY,
      email: STUDIO_LAB2_EMAIL,
      displayName: "Studio Lab 2",
      campaignId: STUDIO_LAB2_CAMPAIGN_ID,
      devPasswordEnv: STUDIO_LAB2_DEV_PASSWORD_ENV,
      defaultDevPassword: STUDIO_LAB2_DEFAULT_DEV_PASSWORD
    },
    tags: STUDIO_LAB2_TAGS.map((t) => ({ tag_id: t.tag_id, label: t.label })),
    tiers: [{ relay_tier_id: STUDIO_LAB2_TIER_ID, title: "Studio", amount_cents: 1200 }],
    posts,
    distribution,
    metrics,
    eval: {
      min_published_posts: 100,
      hero_academy_series_id: STUDIO_LAB2_SERIES_HERO_ACADEMY,
      hero_academy_ordered_ids: haOrdered,
      hero_academy_missing_page: 17,
      hero_academy_duplicate_page: 8,
      hero_academy_duplicate_ids: ["sl2_ha_p08", "sl2_ha_p08_dup"],
      watercolor_post_ids: watercolorIds,
      already_on_x_post_ids: alreadyOnX,
      imported_revise_post_id: "sl2_ha_p02",
      native_revise_post_id: "sl2_rn_01",
      gated_original_post_ids: gatedIds,
      academy_ambiguous_labels: ["Hero Academy", "Academy Studies"],
      pagination_requires_second_page: true
    }
  };

  return { ...withoutHash, fixture_hash: hashStudioLab2Corpus(withoutHash) };
}

function isIsoUtc(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value)) return false;
  return !Number.isNaN(Date.parse(value));
}

/** Structural + composition validation (no DB). */
export function validateStudioLab2Corpus(spec: unknown): string[] {
  const errors: string[] = [];
  if (!spec || typeof spec !== "object") return ["spec must be an object"];
  const s = spec as StudioLab2Corpus;
  if (s.version !== 1) errors.push(`version must be 1 (got ${String(s.version)})`);
  if (s.label !== STUDIO_LAB2_LABEL) errors.push(`label must be ${STUDIO_LAB2_LABEL}`);
  if (s.creator?.relayCreatorId !== STUDIO_LAB2_CREATOR_ID) {
    errors.push("creator.relayCreatorId must be rcx_studio_lab2");
  }
  if (s.creator?.accountKey !== STUDIO_LAB2_ACCOUNT_KEY) errors.push("creator.accountKey mismatch");
  if (s.creator?.email !== STUDIO_LAB2_EMAIL) errors.push("creator.email mismatch");
  if ((s.label as string) === "goals-lab-synthetic-v1") {
    errors.push("must not reuse Goals Lab label");
  }

  const tagIds = new Set((s.tags ?? []).map((t) => t.tag_id));
  for (const expected of STUDIO_LAB2_TAGS) {
    if (!tagIds.has(expected.tag_id)) errors.push(`missing tag ${expected.tag_id}`);
  }

  if (!Array.isArray(s.posts)) {
    errors.push("posts array required");
    return errors;
  }
  if (s.posts.length < 100 || s.posts.length > 120) {
    errors.push(`posts length ${s.posts.length} must be 100–120 (target 112)`);
  }

  const postIds = new Set<string>();
  const mediaIds = new Set<string>();
  for (const p of s.posts) {
    if (!p.post_id || postIds.has(p.post_id)) errors.push(`duplicate or empty post_id ${p.post_id}`);
    postIds.add(p.post_id);
    if (p.source !== "PATREON" && p.source !== "RELAY") errors.push(`${p.post_id}: bad source`);
    if (!isIsoUtc(p.published_at)) errors.push(`${p.post_id}: published_at must be ISO-8601 UTC`);
    for (const tag of p.tag_ids ?? []) {
      if (!tagIds.has(tag)) errors.push(`${p.post_id}: unknown tag ${tag}`);
    }
    if (!Array.isArray(p.media) || p.media.length < 1) errors.push(`${p.post_id}: media required`);
    for (const m of p.media ?? []) {
      if (!m.media_id || mediaIds.has(m.media_id)) {
        errors.push(`duplicate or empty media_id ${m.media_id}`);
      }
      mediaIds.add(m.media_id);
    }
  }

  const ha = s.posts.filter((p) => p.series_id === STUDIO_LAB2_SERIES_HERO_ACADEMY);
  if (ha.length !== 21) errors.push(`Hero Academy must have 21 posts (got ${ha.length})`);
  const wc = s.posts.filter((p) => p.post_id.startsWith("sl2_wc_"));
  if (wc.length !== 18) errors.push(`watercolor must have 18 posts (got ${wc.length})`);
  const rn = s.posts.filter((p) => p.source === "RELAY");
  if (rn.length !== 6) errors.push(`Relay-native must have 6 posts (got ${rn.length})`);
  const gt = s.posts.filter((p) => p.post_id.startsWith("sl2_gt_"));
  if (gt.length !== 8) errors.push(`gated studio shots must have 8 posts (got ${gt.length})`);
  for (const g of gt) {
    const cover = g.media.find((m) => m.role === "cover" && m.visibility === "public");
    const orig = g.media.find((m) => m.role === "original" && m.visibility === "gated");
    if (!cover || !orig || cover.media_id === orig.media_id) {
      errors.push(`${g.post_id}: requires distinct public cover and gated original`);
    }
    if (g.is_public !== false || g.access !== "gated") {
      errors.push(`${g.post_id}: must be gated / not public`);
    }
  }

  const ev = s.eval;
  if (!ev) {
    errors.push("eval block required");
    return errors;
  }
  if (ev.min_published_posts < 100) errors.push("eval.min_published_posts must be >= 100");
  if (ev.pagination_requires_second_page !== true) {
    errors.push("eval.pagination_requires_second_page must be true");
  }
  if (ev.hero_academy_missing_page !== 17) errors.push("eval missing page must be 17");
  if (ev.hero_academy_duplicate_page !== 8) errors.push("eval duplicate page must be 8");
  if (JSON.stringify(ev.hero_academy_duplicate_ids) !== JSON.stringify(["sl2_ha_p08", "sl2_ha_p08_dup"])) {
    errors.push("eval.hero_academy_duplicate_ids mismatch");
  }
  if (!postIds.has(ev.imported_revise_post_id)) errors.push("imported_revise_post_id missing");
  else if (s.posts.find((p) => p.post_id === ev.imported_revise_post_id)?.source !== "PATREON") {
    errors.push("imported_revise_post_id must be PATREON");
  }
  if (!postIds.has(ev.native_revise_post_id)) errors.push("native_revise_post_id missing");
  else if (s.posts.find((p) => p.post_id === ev.native_revise_post_id)?.source !== "RELAY") {
    errors.push("native_revise_post_id must be RELAY");
  }
  for (const id of ev.watercolor_post_ids ?? []) {
    if (!postIds.has(id)) errors.push(`watercolor id missing ${id}`);
  }
  if ((ev.watercolor_post_ids ?? []).length !== 18) errors.push("watercolor_post_ids must list 18");
  const already = ev.already_on_x_post_ids ?? [];
  if (already.join(",") !== "sl2_ha_p01,sl2_ha_p02,sl2_ha_p03,sl2_ha_p04,sl2_ha_p05,sl2_ha_p06") {
    errors.push("already_on_x_post_ids must be sl2_ha_p01–p06");
  }
  for (const id of already) {
    if (!s.distribution?.some((d) => d.post_id === id && d.destination === "x" && d.attempt_status === "posted")) {
      errors.push(`distribution missing posted X row for ${id}`);
    }
  }
  const labels = [...(ev.academy_ambiguous_labels ?? [])].sort();
  if (JSON.stringify(labels) !== JSON.stringify(["Academy Studies", "Hero Academy"])) {
    errors.push("academy_ambiguous_labels must be Hero Academy and Academy Studies");
  }

  if (ev.hero_academy_ordered_ids?.includes("sl2_ha_p08_dup")) {
    errors.push("hero_academy_ordered_ids must exclude the duplicate until the artist chooses");
  }
  if (ev.hero_academy_ordered_ids?.[0] !== "sl2_ha_cover") {
    errors.push("hero_academy_ordered_ids must start with cover");
  }

  const haForParse = ha.map((p) => ({ post_id: p.post_id, title: p.title }));
  try {
    const resolved = resolveNumberedSequence(haForParse);
    if (!resolved.gaps.includes(17)) errors.push("Hero Academy parse must report gap 17");
    if (!resolved.duplicates.includes(8)) errors.push("Hero Academy parse must report duplicate 8");
    const cover = parseSequenceToken("Hero Academy Cover");
    if (!cover.is_cover) errors.push("cover title must parse as cover");
    if (parseSequenceToken("Hero Academy Page 2").number !== 2) errors.push("Page 2 parse");
    if (parseSequenceToken("Hero Academy Part 3").number !== 3) errors.push("Part 3 parse");
    if (parseSequenceToken("Hero Academy Pg. 4").number !== 4) errors.push("Pg. 4 parse");
    if (parseSequenceToken("Hero Academy P. 5").number !== 5) errors.push("P. 5 parse");
    if (parseSequenceToken("Hero Academy page 06").number !== 6) errors.push("page 06 parse");
    const ten = resolved.members.find((m) => m.post_id === "sl2_ha_p10");
    const two = resolved.members.find((m) => m.post_id === "sl2_ha_p02");
    if (!ten || !two || ten.sort_key <= two.sort_key) {
      errors.push("Page 10 must sort after Page 2");
    }
  } catch (err) {
    errors.push(`Hero Academy sequence parse failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (typeof s.fixture_hash !== "string" || s.fixture_hash.length !== 64) {
    errors.push("fixture_hash must be sha256 hex");
  } else if (s.fixture_hash !== hashStudioLab2Corpus(s)) {
    errors.push("fixture_hash does not match canonical JSON");
  }

  return errors;
}

export function defaultStudioLab2CorpusPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, "../../../tests/fixtures/studio-lab2-corpus.json"),
    join(here, "../../../../tests/fixtures/studio-lab2-corpus.json")
  ];
  for (const path of candidates) {
    if (existsSync(path)) return path;
  }
  return candidates[0]!;
}

export function loadStudioLab2Corpus(fixturePath?: string): StudioLab2Corpus {
  const path = fixturePath?.trim() || defaultStudioLab2CorpusPath();
  const parsed = JSON.parse(readFileSync(path, "utf8")) as StudioLab2Corpus;
  const errors = validateStudioLab2Corpus(parsed);
  if (errors.length > 0) {
    throw new Error(`Invalid Studio Lab 2 corpus (${path}):\n${errors.join("\n")}`);
  }
  return parsed;
}

export function writeStudioLab2CorpusFixture(targetPath?: string): { path: string; hash: string } {
  const corpus = authorStudioLab2Corpus();
  const errors = validateStudioLab2Corpus(corpus);
  if (errors.length > 0) {
    throw new Error(`Authored Lab 2 corpus invalid:\n${errors.join("\n")}`);
  }
  const path = targetPath?.trim() || defaultStudioLab2CorpusPath();
  writeFileSync(path, `${JSON.stringify(corpus, null, 2)}\n`, "utf8");
  return { path, hash: corpus.fixture_hash };
}

if (process.argv.includes("--write")) {
  const out = writeStudioLab2CorpusFixture();
  process.stdout.write(`${out.path}\n${out.hash}\n`);
}
