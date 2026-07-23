/**
 * Local kit CMS mutations for posts/media (EH-060).
 * Writes data/site.json only — productionSafe remains false.
 */

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync
} from "node:fs";
import { basename, extname, join } from "node:path";
import {
  parseSiteBundle,
  serializeSiteBundle,
  type AccessLevel,
  type CloneMediaRef,
  type ClonePostEntry,
  type SiteBundle
} from "../contracts";
import { markPostLocallyEdited } from "../patreon/sync-state";

const SAFE_SLUG_RE = /^[\p{L}\p{N}_][\p{L}\p{N}_.-]*$/u;

export function sanitizeBodyPlain(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const stripped = raw
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
  return stripped.length ? stripped.slice(0, 20_000) : null;
}

export function slugifyTitle(title: string): string {
  const base = title
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return base || `post-${Date.now().toString(36)}`;
}

function sitePath(kitDir: string): string {
  return join(kitDir, "data", "site.json");
}

export function loadSiteBundleFromKit(kitDir = process.cwd()): SiteBundle {
  const path = sitePath(kitDir);
  const raw = readFileSync(path, "utf8").replace(/^\uFEFF/, "");
  return parseSiteBundle(JSON.parse(raw) as unknown);
}

export function saveSiteBundle(bundle: SiteBundle, kitDir = process.cwd()): void {
  const normalized = parseSiteBundle(bundle);
  const dir = join(kitDir, "data");
  mkdirSync(dir, { recursive: true });
  writeFileSync(sitePath(kitDir), serializeSiteBundle(normalized), "utf8");
}

export function recountTotalMedia(posts: readonly ClonePostEntry[]): number {
  const ids = new Set<string>();
  for (const p of posts) {
    for (const m of p.media) ids.add(m.media_id);
  }
  return ids.size;
}

export function isPublishedForGallery(post: ClonePostEntry): boolean {
  return post.status !== "draft";
}

export function sortPostsForGallery(
  posts: readonly ClonePostEntry[]
): ClonePostEntry[] {
  const published = posts.filter(isPublishedForGallery);
  return [...published].sort((a, b) => {
    const fa =
      typeof a.feature_order === "number" && Number.isFinite(a.feature_order)
        ? a.feature_order
        : Number.POSITIVE_INFINITY;
    const fb =
      typeof b.feature_order === "number" && Number.isFinite(b.feature_order)
        ? b.feature_order
        : Number.POSITIVE_INFINITY;
    if (fa !== fb) return fa - fb;
    return Date.parse(b.published_at) - Date.parse(a.published_at);
  });
}

export type UpsertPostInput = {
  post_id?: string;
  title: string;
  slug?: string;
  published_at?: string;
  tag_ids?: string[];
  access_level: AccessLevel;
  tier_ids?: string[];
  status?: "draft" | "published";
  feature_order?: number | null;
  public_cover_media_id?: string | null;
  body_plain?: string | null;
  /** Replace media list when provided. */
  media?: CloneMediaRef[];
};

export type UpsertPostResult =
  | { ok: true; post: ClonePostEntry; created: boolean }
  | { ok: false; reason: string };

export function upsertPost(
  input: UpsertPostInput,
  kitDir = process.cwd()
): UpsertPostResult {
  const site = loadSiteBundleFromKit(kitDir);
  const title = input.title.trim();
  if (!title) return { ok: false, reason: "title_required" };

  let slug = (input.slug?.trim() || slugifyTitle(title)).toLowerCase();
  if (!SAFE_SLUG_RE.test(slug)) {
    return { ok: false, reason: "invalid_slug" };
  }

  const postId =
    input.post_id?.trim() ||
    `post_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

  const existingIdx = site.posts.findIndex((p) => p.post_id === postId);
  const created = existingIdx < 0;

  if (
    site.posts.some(
      (p, i) => p.slug === slug && (created || i !== existingIdx)
    )
  ) {
    return { ok: false, reason: "slug_conflict" };
  }

  const level = input.access_level;
  const tier_ids = [...(input.tier_ids ?? [])].filter(Boolean);
  if (level === "tier_gated" && tier_ids.length === 0) {
    return { ok: false, reason: "tier_ids_required" };
  }

  const prev = existingIdx >= 0 ? site.posts[existingIdx] : null;
  const media = input.media ?? prev?.media ?? [];
  const cover = input.public_cover_media_id;
  if (
    cover &&
    !media.some((m) => m.media_id === cover) &&
    cover !== prev?.public_cover_media_id
  ) {
    // Allow cover id that exists on another post's media in kit — soft check
    const known = site.posts.some((p) =>
      p.media.some((m) => m.media_id === cover)
    );
    if (!known && !media.some((m) => m.media_id === cover)) {
      return { ok: false, reason: "public_cover_unknown" };
    }
  }

  const post: ClonePostEntry = {
    post_id: postId,
    slug,
    title,
    published_at:
      input.published_at?.trim() ||
      prev?.published_at ||
      new Date().toISOString(),
    tag_ids: [...(input.tag_ids ?? prev?.tag_ids ?? [])],
    access: {
      level,
      tier_ids,
      ...(level === "tier_gated" ? { match_mode: "tier_or_higher" as const } : {})
    },
    media: [...media],
    status: input.status ?? prev?.status ?? "published",
    feature_order:
      input.feature_order !== undefined
        ? input.feature_order
        : (prev?.feature_order ?? null),
    public_cover_media_id:
      input.public_cover_media_id !== undefined
        ? input.public_cover_media_id
        : (prev?.public_cover_media_id ?? null),
    body_plain:
      input.body_plain !== undefined
        ? sanitizeBodyPlain(input.body_plain)
        : (prev?.body_plain ?? null)
  };

  const posts = [...site.posts];
  if (created) posts.push(post);
  else posts[existingIdx] = post;

  const next: SiteBundle = {
    ...site,
    posts,
    total_media: recountTotalMedia(posts),
    generated_at: new Date().toISOString()
  };
  saveSiteBundle(next, kitDir);
  markPostLocallyEdited(site.site_id, postId, {
    created,
    kitDir
  });
  return { ok: true, post, created };
}

export function deletePost(
  postId: string,
  kitDir = process.cwd()
): { ok: true } | { ok: false; reason: string } {
  const site = loadSiteBundleFromKit(kitDir);
  const posts = site.posts.filter((p) => p.post_id !== postId);
  if (posts.length === site.posts.length) {
    return { ok: false, reason: "post_not_found" };
  }
  saveSiteBundle(
    {
      ...site,
      posts,
      total_media: recountTotalMedia(posts),
      generated_at: new Date().toISOString()
    },
    kitDir
  );
  return { ok: true };
}

export type AttachLocalMediaInput = {
  postId: string;
  /** Absolute or kit-relative source file already on disk (operator drop). */
  sourceFilePath: string;
  mimeType?: string;
  /** When true, also copy under public/media for public posts. */
  publicCopy?: boolean;
};

/**
 * Register a local file as post media under data/private-media/.
 * Does not accept browser multipart in this helper — route layer writes temp first.
 */
export function attachLocalMediaFile(
  input: AttachLocalMediaInput,
  kitDir = process.cwd()
):
  | { ok: true; media: CloneMediaRef; post: ClonePostEntry }
  | { ok: false; reason: string } {
  const site = loadSiteBundleFromKit(kitDir);
  const idx = site.posts.findIndex((p) => p.post_id === input.postId);
  if (idx < 0) return { ok: false, reason: "post_not_found" };
  if (!existsSync(input.sourceFilePath)) {
    return { ok: false, reason: "source_missing" };
  }

  const ext = extname(input.sourceFilePath) || ".bin";
  const mediaId = `m_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 6)}`;
  const fileName = `${mediaId}${ext}`;
  const privateDir = join(kitDir, "data", "private-media");
  mkdirSync(privateDir, { recursive: true });
  const dest = join(privateDir, fileName);
  copyFileSync(input.sourceFilePath, dest);

  const contentPath = `/media/${fileName}`;
  if (input.publicCopy || site.posts[idx]!.access.level === "public") {
    const publicDir = join(kitDir, "public", "media");
    mkdirSync(publicDir, { recursive: true });
    copyFileSync(input.sourceFilePath, join(publicDir, fileName));
  }

  const media: CloneMediaRef = {
    media_id: mediaId,
    has_export: true,
    content_path: contentPath,
    mime_type: input.mimeType || guessMime(ext)
  };

  const post = {
    ...site.posts[idx]!,
    media: [...site.posts[idx]!.media, media]
  };
  const posts = [...site.posts];
  posts[idx] = post;
  saveSiteBundle(
    {
      ...site,
      posts,
      total_media: recountTotalMedia(posts),
      generated_at: new Date().toISOString()
    },
    kitDir
  );
  return { ok: true, media, post };
}

function guessMime(ext: string): string {
  const e = ext.toLowerCase();
  if (e === ".png") return "image/png";
  if (e === ".jpg" || e === ".jpeg") return "image/jpeg";
  if (e === ".gif") return "image/gif";
  if (e === ".webp") return "image/webp";
  if (e === ".svg") return "image/svg+xml";
  if (e === ".mp4") return "video/mp4";
  if (e === ".webm") return "video/webm";
  if (e === ".mp3") return "audio/mpeg";
  return "application/octet-stream";
}

/** Test helper: write a full bundle without going through loadSite cwd. */
export function writeSiteBundleForKit(
  bundle: SiteBundle,
  kitDir: string
): void {
  saveSiteBundle(bundle, kitDir);
}

export function uniqueBasename(path: string): string {
  return basename(path);
}
