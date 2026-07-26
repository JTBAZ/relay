/**
 * Canonical → generated-app importer (EH-011).
 *
 * Produces a validated SiteBundle plus versioned provenance, local mutable state,
 * and a creator-readable import report. Reuses Relay clone-generator (via dist)
 * and fromClone — does not reimplement Patreon mapping.
 */

import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import {
  parseSiteBundle,
  SITE_BUNDLE_CONTRACT_VERSION,
  type ClonePostEntry,
  type CreatorExportIndexInput,
  type SiteBundle
} from "../contracts.js";
import { fromClone } from "../from-clone.js";
import { loadGenerateClone } from "../from-relay.js";
import { resolveBlobPathUnderRoot } from "./path-safety.js";
import {
  IMPORT_LOCAL_STATE_CONTRACT_VERSION,
  IMPORT_PROVENANCE_CONTRACT_VERSION,
  IMPORT_REPORT_CONTRACT_VERSION,
  type AccountedItem,
  type ConflictItem,
  type ImportLocalState,
  type ImportProvenance,
  type ImportReport,
  type LocalPostState,
  type ProvenanceMediaEntry,
  type ProvenancePostEntry,
  type ProvenanceTierEntry
} from "./types.js";
import {
  parseCanonicalForImport,
  parseExportIndexForImport,
  parseImportLocalState,
  parseImportProvenance,
  type ParsedExportIndex,
  type ValidatedCanonicalSlice
} from "./validate.js";

const VIDEO_AUDIO_EMBED_MIME_RE =
  /^(video\/|audio\/|text\/html\b)/i;

export type ImportCanonicalOptions = {
  creatorId: string;
  canonical: unknown;
  exportIndex?: unknown;
  /** Absolute path to creator export root (for blob existence checks). */
  exportCreatorRoot?: string | null;
  displayName?: string;
  handle?: string;
  baseUrl?: string;
  batchId?: string;
  existing?: {
    provenance?: unknown;
    localState?: unknown;
    bundle?: unknown;
  };
};

export type ImportCanonicalResult = {
  bundle: SiteBundle;
  provenance: ImportProvenance;
  localState: ImportLocalState;
  report: ImportReport;
};

function stableSiteId(creatorId: string): string {
  return `site_eh_${creatorId}`;
}

function computeSourceRevision(
  creatorId: string,
  canonical: unknown,
  exportIndex: unknown
): string {
  const h = createHash("sha256");
  h.update(creatorId);
  h.update("\0");
  h.update(JSON.stringify(canonical));
  h.update("\0");
  h.update(JSON.stringify(exportIndex ?? { creator_id: creatorId, media: {} }));
  return h.digest("hex");
}

function clonePost(post: ClonePostEntry): ClonePostEntry {
  return {
    post_id: post.post_id,
    slug: post.slug,
    title: post.title,
    published_at: post.published_at,
    tag_ids: [...post.tag_ids],
    access: {
      level: post.access.level,
      tier_ids: [...post.access.tier_ids],
      ...(post.access.match_mode ? { match_mode: post.access.match_mode } : {})
    },
    media: post.media.map((m) => ({
      media_id: m.media_id,
      has_export: m.has_export,
      content_path: m.content_path,
      ...(m.mime_type ? { mime_type: m.mime_type } : {})
    }))
  };
}

function postMap(bundle: SiteBundle): Map<string, ClonePostEntry> {
  return new Map(bundle.posts.map((p) => [p.post_id, p]));
}

function isProtectedLocal(local: LocalPostState | undefined): boolean {
  if (!local) return false;
  return local.origin === "native" || local.locally_edited || local.origin === "crossposted";
}

function conflictId(kind: string, subject: string): string {
  return `conflict_${kind}_${subject}`;
}

function buildProvenanceMedia(
  mediaId: string,
  slice: ValidatedCanonicalSlice,
  exportIndex: ParsedExportIndex,
  exportCreatorRoot: string | null | undefined
): ProvenanceMediaEntry {
  const row = slice.media[mediaId];
  const exp = exportIndex.media[mediaId];
  let blob_missing = false;
  if (exp && exportCreatorRoot) {
    try {
      const abs = resolveBlobPathUnderRoot(
        exportCreatorRoot,
        exp.relative_blob_path
      );
      if (!existsSync(abs)) blob_missing = true;
    } catch {
      // Contained resolve failed — treat as missing, never follow escapes.
      blob_missing = true;
    }
  }
  const entry: ProvenanceMediaEntry = {
    media_id: mediaId,
    provider_object_id: mediaId,
    has_export: Boolean(exp),
    ...(blob_missing ? { blob_missing: true } : {})
  };
  const mime = exp?.mime_type ?? row?.current?.mime_type;
  if (mime) entry.mime_type = mime;
  if (typeof exp?.byte_length === "number") entry.byte_length = exp.byte_length;
  if (exp?.sha256) entry.checksum = exp.sha256;
  const rev = exp?.upstream_revision ?? row?.current?.upstream_revision;
  if (rev) entry.upstream_revision = rev;
  return entry;
}

function hasMatureMetadata(current: {
  is_mature?: boolean;
  legal_adult?: boolean;
  content_flags?: string[];
}): boolean {
  if (current.is_mature === true || current.legal_adult === true) return true;
  if (Array.isArray(current.content_flags) && current.content_flags.length > 0) {
    return current.content_flags.some((f) =>
      /mature|legal[_-]?adult|nsfw/i.test(f)
    );
  }
  return false;
}

/**
 * Import canonical + optional export index into SiteBundle + provenance + local state.
 */
export function importCanonical(opts: ImportCanonicalOptions): ImportCanonicalResult {
  const creatorId = opts.creatorId;
  const slice = parseCanonicalForImport(opts.canonical, creatorId);
  const exportIndex = parseExportIndexForImport(opts.exportIndex, creatorId);

  const existingProvenance = opts.existing?.provenance
    ? parseImportProvenance(opts.existing.provenance)
    : null;
  const existingLocal = opts.existing?.localState
    ? parseImportLocalState(opts.existing.localState)
    : null;
  const existingBundle = opts.existing?.bundle
    ? parseSiteBundle(opts.existing.bundle)
    : null;

  if (existingProvenance && existingProvenance.creator_id !== creatorId) {
    throw new Error(
      `existing provenance creator_id mismatch: expected ${creatorId}`
    );
  }
  if (existingLocal && existingLocal.creator_id !== creatorId) {
    throw new Error(
      `existing local state creator_id mismatch: expected ${creatorId}`
    );
  }

  const generateCloneSiteModel = loadGenerateClone();
  const exportForClone: CreatorExportIndexInput = {
    creator_id: creatorId,
    media: Object.fromEntries(
      Object.entries(exportIndex.media).map(([id, rec]) => [
        id,
        {
          media_id: rec.media_id,
          relative_blob_path: rec.relative_blob_path,
          ...(rec.mime_type ? { mime_type: rec.mime_type } : {}),
          ...(rec.sha256 ? { sha256: rec.sha256 } : {}),
          ...(typeof rec.byte_length === "number"
            ? { byte_length: rec.byte_length }
            : {}),
          ...(rec.exported_at ? { exported_at: rec.exported_at } : {})
        }
      ])
    )
  };

  const cloneRaw = generateCloneSiteModel(
    creatorId,
    slice.raw,
    exportForClone,
    opts.baseUrl ?? "http://localhost:3001"
  );

  let upstreamBundle = fromClone({
    clone: cloneRaw,
    exportIndex: exportForClone,
    creator: {
      display_name: opts.displayName ?? creatorId,
      handle:
        opts.handle ??
        creatorId.replace(/[^a-zA-Z0-9_-]/g, "-").toLowerCase()
    }
  });

  const siteId =
    existingLocal?.site_id ??
    existingProvenance?.site_id ??
    existingBundle?.site_id ??
    stableSiteId(creatorId);

  const now = new Date().toISOString();
  const batchId = opts.batchId ?? `batch_${randomUUID()}`;
  const sourceRevision = computeSourceRevision(
    creatorId,
    opts.canonical,
    opts.exportIndex ?? exportForClone
  );

  const upstreamPosts = postMap(upstreamBundle);
  const priorPosts = existingBundle ? postMap(existingBundle) : new Map();

  const exclusions: AccountedItem[] = [];
  const failures: AccountedItem[] = [];
  const conflicts: ConflictItem[] = [];
  const notes: string[] = [
    "Premium media may still be copied into public/media by fillTemplate (prototype only; not private delivery).",
    "Run migrate-media for private object ledger + private-read verification; visitor signed URLs are EH-033.",
    "productionSafe remains false."
  ];

  const nextLocalPosts: Record<string, LocalPostState> = Object.create(null);
  const nextProvenancePosts: Record<string, ProvenancePostEntry> = Object.create(null);
  const nextProvenanceMedia: Record<string, ProvenanceMediaEntry> = Object.create(null);
  const mergedPosts: ClonePostEntry[] = [];
  const seenPostIds = new Set<string>();

  let postsImported = 0;
  let postsExcluded = 0;
  let postsFailed = 0;
  let mediaImported = 0;
  let mediaExcluded = 0;
  let mediaFailed = 0;
  let missingExport = 0;

  const allPostIds = new Set([
    ...Object.keys(slice.posts),
    ...Object.keys(existingLocal?.posts ?? {}),
    ...upstreamPosts.keys()
  ]);

  for (const postId of [...allPostIds].sort()) {
    const canonicalPost = slice.posts[postId];
    const priorLocal = existingLocal?.posts[postId];
    const priorProv = existingProvenance?.posts[postId];
    const upstream = upstreamPosts.get(postId);
    const priorBundlePost = priorPosts.get(postId);

    // Tombstoned / deleted upstream
    if (canonicalPost?.upstream_status === "deleted") {
      postsExcluded += 1;
      const fieldPath = `posts.${creatorId}.${postId}.upstream_status`;
      if (priorLocal && isProtectedLocal(priorLocal)) {
        const c: ConflictItem = {
          id: conflictId("tombstone", postId),
          kind: "tombstone",
          post_id: postId,
          field_paths: [fieldPath, `posts.${postId}`],
          recommended_action:
            "review_keep_local_or_apply_tombstone — upstream deleted; local post is protected",
          summary: `Upstream tombstoned post ${postId}; local origin=${priorLocal.origin} locally_edited=${priorLocal.locally_edited}`
        };
        if (!conflicts.some((x) => x.id === c.id)) conflicts.push(c);
        if (priorBundlePost) {
          mergedPosts.push(clonePost(priorBundlePost));
          seenPostIds.add(postId);
          nextLocalPosts[postId] = { ...priorLocal, edit_markers: [...priorLocal.edit_markers] };
        }
      } else {
        exclusions.push({
          id: `excl_tombstone_${postId}`,
          kind: "tombstone",
          reason: "Upstream post is deleted/tombstoned; accounted exclusion (not silent drop).",
          field_paths: [fieldPath],
          post_id: postId
        });
        // Do not keep unprotected imported tombstones in the live bundle.
      }
      if (canonicalPost.current) {
        nextProvenancePosts[postId] = {
          provider: "relay_canonical",
          provider_object_id: postId,
          published_at: canonicalPost.current.published_at,
          upstream_revision: canonicalPost.current.upstream_revision,
          source_tier_ids: [...canonicalPost.current.tier_ids],
          access_snapshot: {
            level: "public",
            tier_ids: []
          },
          media: [],
          upstream_status: "deleted"
        };
      }
      continue;
    }

    // Mature metadata — accounted exclusion from live SiteBundle (no field invention;
    // private/legal enforcement remains EH-012+).
    if (canonicalPost?.current && hasMatureMetadata(canonicalPost.current)) {
      postsExcluded += 1;
      exclusions.push({
        id: `excl_mature_${postId}`,
        kind: "mature_metadata",
        reason:
          "Mature/legal-adult metadata present on canonical post; excluded from live SiteBundle (accounted). Private/legal enforcement remains deferred (EH-012+).",
        field_paths: [
          `posts.${creatorId}.${postId}.current.is_mature`,
          `posts.${creatorId}.${postId}.current.legal_adult`,
          `posts.${creatorId}.${postId}.current.content_flags`
        ],
        post_id: postId
      });
      notes.push(
        `Post ${postId}: mature metadata excluded from live bundle (accounted); SiteBundle has no mature field; EH-012+ owns enforcement.`
      );
      nextProvenancePosts[postId] = {
        provider: "relay_canonical",
        provider_object_id: postId,
        published_at: canonicalPost.current.published_at,
        upstream_revision: canonicalPost.current.upstream_revision,
        source_tier_ids: [...canonicalPost.current.tier_ids],
        access_snapshot: {
          level: "public",
          tier_ids: []
        },
        media: [],
        upstream_status: canonicalPost.upstream_status
      };
      continue;
    }

    if (!upstream && !priorBundlePost) {
      // Expected active post missing from clone output without tombstone — fail closed account.
      if (canonicalPost?.upstream_status === "active") {
        postsFailed += 1;
        failures.push({
          id: `fail_missing_clone_${postId}`,
          kind: "failed",
          reason: "Active canonical post missing from clone-generator output.",
          field_paths: [`posts.${creatorId}.${postId}`],
          post_id: postId
        });
      }
      continue;
    }

    // Protected local: conflict on upstream revision change; never overwrite.
    if (priorLocal && isProtectedLocal(priorLocal) && upstream) {
      const prevRev = priorProv?.upstream_revision;
      const nextRev = canonicalPost?.current?.upstream_revision;
      if (prevRev && nextRev && prevRev !== nextRev) {
        const kind = priorLocal.origin === "native" ? "native_post" : "local_edit";
        const c: ConflictItem = {
          id: conflictId(kind, postId),
          kind,
          post_id: postId,
          field_paths: [
            `posts.${postId}`,
            `posts.${creatorId}.${postId}.current.upstream_revision`
          ],
          recommended_action:
            kind === "native_post"
              ? "keep_native_review_upstream — do not overwrite native post"
              : "keep_local_edit_or_accept_upstream — local edits block silent refresh",
          summary: `Upstream revision changed for protected post ${postId} (${prevRev} → ${nextRev})`
        };
        if (!conflicts.some((x) => x.id === c.id)) conflicts.push(c);
      }
      const keep = priorBundlePost
        ? clonePost({
            ...priorBundlePost,
            ...(priorLocal.local_title ? { title: priorLocal.local_title } : {}),
            slug: priorLocal.slug
          })
        : clonePost(upstream);
      mergedPosts.push(keep);
      seenPostIds.add(postId);
      nextLocalPosts[postId] = {
        ...priorLocal,
        edit_markers: [...priorLocal.edit_markers]
      };
      if (priorProv) {
        nextProvenancePosts[postId] = {
          ...priorProv,
          media: priorProv.media.map((m) => ({ ...m }))
        };
      }
      continue;
    }

    // Idempotent path: imported + unmarked — refresh only on revision change.
    if (upstream) {
      let chosen = clonePost(upstream);
      if (
        priorLocal &&
        priorLocal.origin === "imported" &&
        !priorLocal.locally_edited &&
        priorProv &&
        canonicalPost?.current &&
        priorProv.upstream_revision === canonicalPost.current.upstream_revision &&
        priorBundlePost
      ) {
        // Unchanged upstream revision — keep prior local slug / content stable.
        chosen = clonePost({
          ...priorBundlePost,
          slug: priorLocal.slug
        });
      } else if (priorLocal?.slug) {
        chosen = { ...chosen, slug: priorLocal.slug };
      }

      // Video/audio/embed mime — accounted exclusion (no private R2 claim).
      for (const m of chosen.media) {
        const mime = m.mime_type ?? "";
        if (VIDEO_AUDIO_EMBED_MIME_RE.test(mime)) {
          mediaExcluded += 1;
          exclusions.push({
            id: `excl_av_${m.media_id}`,
            kind: "video_audio_embed",
            reason:
              "Video/audio/embed mime recorded; private blob migration is EH-012. No fake import success for binary AV.",
            field_paths: [`media.${creatorId}.${m.media_id}.current.mime_type`],
            media_id: m.media_id,
            post_id: postId
          });
        }
      }

      const provMedia: ProvenanceMediaEntry[] = [];
      for (const m of chosen.media) {
        const pm = buildProvenanceMedia(
          m.media_id,
          slice,
          exportIndex,
          opts.exportCreatorRoot
        );
        if (!pm.has_export) {
          missingExport += 1;
          exclusions.push({
            id: `excl_missing_export_${m.media_id}`,
            kind: "missing_export",
            reason:
              "Media referenced without export index entry; recorded without claiming blob copy success.",
            field_paths: [`export_index.media.${m.media_id}`],
            media_id: m.media_id,
            post_id: postId
          });
        } else if (pm.blob_missing) {
          mediaFailed += 1;
          failures.push({
            id: `fail_missing_blob_${m.media_id}`,
            kind: "failed",
            reason:
              "Export index lists blob but file is missing on disk; not treated as successful media import.",
            field_paths: [
              `export_index.media.${m.media_id}.relative_blob_path`
            ],
            media_id: m.media_id,
            post_id: postId
          });
        } else {
          mediaImported += 1;
        }
        provMedia.push(pm);
        nextProvenanceMedia[m.media_id] = pm;
        // Align has_export with index presence; blob_missing does not fake success in report.
        m.has_export = pm.has_export && !pm.blob_missing;
      }

      mergedPosts.push(chosen);
      seenPostIds.add(postId);
      postsImported += 1;

      nextLocalPosts[postId] = {
        slug: chosen.slug,
        origin: priorLocal?.origin ?? "imported",
        locally_edited: priorLocal?.locally_edited ?? false,
        edit_markers: priorLocal ? [...priorLocal.edit_markers] : [],
        ...(priorLocal?.local_title ? { local_title: priorLocal.local_title } : {}),
        ...(priorLocal?.redirects ? { redirects: [...priorLocal.redirects] } : {})
      };

      if (canonicalPost?.current) {
        nextProvenancePosts[postId] = {
          provider: "relay_canonical",
          provider_object_id: postId,
          published_at: chosen.published_at,
          upstream_revision: canonicalPost.current.upstream_revision,
          source_tier_ids: [...canonicalPost.current.tier_ids],
          access_snapshot: {
            level: chosen.access.level,
            tier_ids: [...chosen.access.tier_ids],
            ...(chosen.access.match_mode
              ? { match_mode: chosen.access.match_mode }
              : {})
          },
          media: provMedia,
          upstream_status: "active"
        };
      }
    }
  }

  // Native local posts not present upstream — keep them.
  if (existingLocal && existingBundle) {
    for (const [postId, local] of Object.entries(existingLocal.posts)) {
      if (seenPostIds.has(postId)) continue;
      if (local.origin !== "native" && local.origin !== "crossposted") continue;
      const prior = priorPosts.get(postId);
      if (!prior) continue;
      mergedPosts.push(clonePost(prior));
      seenPostIds.add(postId);
      nextLocalPosts[postId] = {
        ...local,
        edit_markers: [...local.edit_markers]
      };
    }
  }

  // Tier remap / legacy rename detection.
  const tierMappings: Record<string, string> = {
    ...(existingLocal?.tier_mappings ?? {})
  };
  for (const [sourceId, localId] of Object.entries(tierMappings)) {
    const sourceGone = !slice.tiers[sourceId];
    const localPresent = Boolean(slice.tiers[localId]);
    if (sourceGone && localPresent) {
      const c: ConflictItem = {
        id: conflictId("tier_remap", `${sourceId}_${localId}`),
        kind: "tier_remap",
        tier_id: sourceId,
        field_paths: [
          `tier_mappings.${sourceId}`,
          `tiers.${creatorId}.${localId}`
        ],
        recommended_action:
          "confirm_legacy_tier_mapping — source tier absent; local mapping retained for review",
        summary: `Legacy tier ${sourceId} maps to ${localId}; source tier no longer in upstream catalog`
      };
      if (!conflicts.some((x) => x.id === c.id)) conflicts.push(c);
    }
  }
  // Auto-detect title/amount drift for tiers that share titles with prior provenance.
  if (existingProvenance) {
    for (const [tierId, priorTier] of Object.entries(existingProvenance.tiers)) {
      const current = slice.tiers[tierId];
      if (!current) continue;
      if (
        priorTier.title !== current.title ||
        (priorTier.amount_cents ?? null) !== (current.amount_cents ?? null)
      ) {
        const c: ConflictItem = {
          id: conflictId("tier_remap", tierId),
          kind: "tier_remap",
          tier_id: tierId,
          field_paths: [
            `tiers.${creatorId}.${tierId}.title`,
            `tiers.${creatorId}.${tierId}.amount_cents`
          ],
          recommended_action:
            "review_tier_rename_or_price_change — update local mappings and patron grants",
          summary: `Tier ${tierId} changed (title/amount) since last import`
        };
        if (!conflicts.some((x) => x.id === c.id)) conflicts.push(c);
      }
    }
  }

  const nextProvenanceTiers: Record<string, ProvenanceTierEntry> = Object.create(null);
  for (const [tierId, tier] of Object.entries(slice.tiers)) {
    nextProvenanceTiers[tierId] = {
      provider_object_id: tierId,
      title: tier.title,
      ...(typeof tier.amount_cents === "number"
        ? { amount_cents: tier.amount_cents }
        : {}),
      ...(tier.campaign_id ? { campaign_id: tier.campaign_id } : {}),
      version_seq: tier.version_seq
    };
  }

  // Sort posts like clone (newest first) for stable-ish output.
  mergedPosts.sort(
    (a, b) =>
      new Date(b.published_at).getTime() - new Date(a.published_at).getTime()
  );

  const totalMedia = mergedPosts.reduce((n, p) => n + p.media.length, 0);
  const bundle = parseSiteBundle({
    contract_version: SITE_BUNDLE_CONTRACT_VERSION,
    site_id: siteId,
    creator_id: creatorId,
    generated_at: now,
    base_url: upstreamBundle.base_url,
    creator: upstreamBundle.creator,
    theme: upstreamBundle.theme,
    demo_personas: upstreamBundle.demo_personas,
    tiers: upstreamBundle.tiers,
    posts: mergedPosts,
    total_media: totalMedia
  });

  const importedPostIds = Object.keys(nextLocalPosts)
    .filter((id) => nextLocalPosts[id].origin === "imported")
    .sort();
  const importedMediaIds = Object.keys(nextProvenanceMedia).sort();

  const provenance: ImportProvenance = {
    contract_version: IMPORT_PROVENANCE_CONTRACT_VERSION,
    site_id: siteId,
    creator_id: creatorId,
    provider: "relay_canonical",
    batch_id: batchId,
    source_revision: sourceRevision,
    imported_at: now,
    posts: nextProvenancePosts,
    tiers: nextProvenanceTiers,
    media: nextProvenanceMedia
  };

  const localState: ImportLocalState = {
    contract_version: IMPORT_LOCAL_STATE_CONTRACT_VERSION,
    site_id: siteId,
    creator_id: creatorId,
    updated_at: now,
    posts: nextLocalPosts,
    tier_mappings: tierMappings,
    conflict_queue: conflicts.map((c) => ({
      ...c,
      field_paths: [...c.field_paths]
    })),
    replay_ledger: {
      last_batch_id: batchId,
      last_source_revision: sourceRevision,
      imported_post_ids: importedPostIds,
      imported_media_ids: importedMediaIds
    }
  };

  const expectedPosts = Object.values(slice.posts).filter(
    (p) => p.upstream_status === "active"
  ).length;
  const expectedMedia = Object.values(slice.media).filter(
    (m) => m.upstream_status === "active"
  ).length;

  const report: ImportReport = {
    contract_version: IMPORT_REPORT_CONTRACT_VERSION,
    batch_id: batchId,
    creator_id: creatorId,
    site_id: siteId,
    generated_at: now,
    source_revision: sourceRevision,
    posts: {
      expected: expectedPosts,
      imported: postsImported,
      excluded: postsExcluded,
      failed: postsFailed,
      conflicts: conflicts.filter((c) => c.post_id).length
    },
    media: {
      expected: expectedMedia,
      imported: mediaImported,
      excluded: mediaExcluded,
      failed: mediaFailed,
      missing_export: missingExport
    },
    tiers: {
      expected: Object.keys(slice.tiers).length,
      mapped: Object.keys(tierMappings).length,
      unmapped: Math.max(
        0,
        Object.keys(slice.tiers).length - Object.keys(tierMappings).length
      )
    },
    exclusions,
    failures,
    conflicts: localState.conflict_queue,
    notes
  };

  // Re-parse for fail-closed output shapes.
  return {
    bundle,
    provenance: parseImportProvenance(provenance),
    localState: parseImportLocalState(localState),
    report
  };
}
