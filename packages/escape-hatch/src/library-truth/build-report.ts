/**
 * Build versioned library parity report from kit artifacts (EH-013).
 */

import {
  canViewPost,
  type ClonePostEntry,
  type DemoPersona,
  type SiteBundle
} from "../contracts.js";
import type {
  ImportLocalState,
  ImportProvenance,
  ImportReport
} from "../import/types.js";
import type {
  MediaMigrationLedger,
  MediaMigrationReport
} from "../migrate/types.js";
import { evaluateContinueGate } from "./gate.js";
import {
  LIBRARY_PARITY_REPORT_CONTRACT_VERSION,
  type AccessBucketInspect,
  type AccessSimulationRow,
  type AccountedItemNote,
  type LibraryAnomaly,
  type LibraryParityReport,
  type LibraryTruthState
} from "./types.js";

export type BuildLibraryParityReportInput = {
  bundle?: SiteBundle | null;
  importReport?: ImportReport | null;
  provenance?: ImportProvenance | null;
  importState?: ImportLocalState | null;
  migrationLedger?: MediaMigrationLedger | null;
  migrationReport?: MediaMigrationReport | null;
  /** Prior exclusions inform gate.unresolved counts only. */
  state?: LibraryTruthState | null;
  now?: () => Date;
};

function iso(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, ".000Z");
}

function isPremiumAccess(level: string): boolean {
  return level === "member_only" || level === "tier_gated";
}

function mediaAccessClass(
  post: ClonePostEntry | undefined
): "public" | "member_only" | "tier_gated" | "unknown" {
  if (!post) return "unknown";
  if (post.access.level === "public") return "public";
  if (post.access.level === "member_only") return "member_only";
  if (post.access.level === "tier_gated") return "tier_gated";
  return "unknown";
}

function findPostsForMedia(
  bundle: SiteBundle,
  mediaId: string
): ClonePostEntry[] {
  return bundle.posts.filter((p) => p.media.some((m) => m.media_id === mediaId));
}

function buildAccessBuckets(bundle: SiteBundle): AccessBucketInspect[] {
  const buckets: AccessBucketInspect[] = [
    {
      id: "public",
      title: "Public",
      blurb: "Anyone can open these posts — no membership required.",
      post_ids: [],
      post_count: 0,
      media_count: 0
    },
    {
      id: "all_paid_members",
      title: "All paid members",
      blurb: "Visible to any paying member, regardless of tier.",
      post_ids: [],
      post_count: 0,
      media_count: 0
    }
  ];
  for (const tier of bundle.tiers) {
    buckets.push({
      id: tier.tier_id,
      title: tier.title,
      blurb: `Tier bucket for ${tier.title}. Exact tier means only this tier; tier or higher also includes tiers priced above it.`,
      post_ids: [],
      post_count: 0,
      media_count: 0
    });
  }

  for (const post of bundle.posts) {
    let bucketId = "public";
    if (post.access.level === "member_only") bucketId = "all_paid_members";
    else if (post.access.level === "tier_gated") {
      const first = post.access.tier_ids[0];
      bucketId = first ?? "all_paid_members";
    }
    const bucket = buckets.find((b) => b.id === bucketId) ?? buckets[0];
    bucket.post_ids.push(post.post_id);
    bucket.post_count += 1;
    bucket.media_count += post.media.length;
  }
  return buckets;
}

function buildAccessSimulations(bundle: SiteBundle): AccessSimulationRow[] {
  const personas: Array<{ id: string; title: string; persona: DemoPersona }> = [
    {
      id: "public",
      title: "Public",
      persona: {
        id: "public",
        label: "Public visitor",
        tier_ids: [],
        tier_catalog: bundle.tiers
      }
    },
    {
      id: "all_paid_members",
      title: "All paid members",
      persona: {
        id: "all_paid",
        label: "Any paid member",
        tier_ids: bundle.tiers
          .filter((t) => (t.amount_cents ?? 0) > 0)
          .map((t) => t.tier_id),
        tier_catalog: bundle.tiers
      }
    }
  ];
  for (const tier of bundle.tiers) {
    personas.push({
      id: tier.tier_id,
      title: tier.title,
      persona: {
        id: `tier_${tier.tier_id}`,
        label: tier.title,
        tier_ids: [tier.tier_id],
        tier_catalog: bundle.tiers
      }
    });
  }

  return personas.map((row) => {
    const visible_post_ids = bundle.posts
      .filter((p) => canViewPost(p, row.persona, bundle.tiers))
      .map((p) => p.post_id);
    return {
      bucket_id: row.id,
      bucket_title: row.title,
      visible_post_ids,
      visible_count: visible_post_ids.length,
      locked_count: bundle.posts.length - visible_post_ids.length,
      non_authoritative: true as const
    };
  });
}

function emptyIdentity(): LibraryParityReport["identity"] {
  return {
    display_name: "(unknown)",
    handle: "unknown",
    creator_id: "unknown",
    site_id: "unknown"
  };
}

/**
 * Build a fail-closed parity report. Always production_safe: false.
 * 100% accounted-for means every post/media is imported, excluded (reason), or failed (reason).
 */
export function buildLibraryParityReport(
  input: BuildLibraryParityReportInput
): LibraryParityReport {
  const now = input.now ?? (() => new Date());
  const generated_at = iso(now());
  const bundle = input.bundle ?? null;
  const importReport = input.importReport ?? null;
  const provenance = input.provenance ?? null;
  const importState = input.importState ?? null;
  const migrationLedger = input.migrationLedger ?? null;
  const migrationReport = input.migrationReport ?? null;

  const artifacts = {
    site_bundle: Boolean(bundle),
    import_report: Boolean(importReport),
    provenance: Boolean(provenance),
    import_state: Boolean(importState),
    media_migration_ledger: Boolean(migrationLedger),
    media_migration_report: Boolean(migrationReport)
  };

  const anomalies: LibraryAnomaly[] = [];
  const exclusions: AccountedItemNote[] = [];
  const failures: AccountedItemNote[] = [];
  const notes: string[] = [];
  const creator_notes: string[] = [];

  const identity = bundle
    ? {
        display_name: bundle.creator.display_name,
        handle: bundle.creator.handle,
        creator_id: bundle.creator_id,
        site_id: bundle.site_id
      }
    : emptyIdentity();

  const site_id = identity.site_id;
  const creator_id = identity.creator_id;

  if (!bundle) {
    anomalies.push({
      id: "missing_site_bundle",
      kind: "missing_artifact",
      blocking: true,
      subject: {},
      what_was_seen: "No site.json / site.bundle.json was found under data/.",
      likely_effect:
        "Library truth cannot summarize identity, tiers, posts, or media.",
      recommended_resolution:
        "Run import-relay-dump or fixture to generate a kit, then re-run library-truth."
    });
    creator_notes.push(
      "This kit is missing site data. Generate or import a site before continuing."
    );
  }

  if (!importReport) {
    anomalies.push({
      id: "missing_import_report",
      kind: "missing_artifact",
      blocking: false,
      subject: {},
      what_was_seen: "import-report.json is missing.",
      likely_effect:
        "Post/media accounting falls back to the live SiteBundle only; import exclusions and failures are unknown.",
      recommended_resolution:
        "Run import-relay-dump for a full import audit, or continue with bundle-only accounting if this kit was built from fixtures."
    });
    notes.push(
      "Degraded: import-report.json missing — accounting uses SiteBundle presence only."
    );
    creator_notes.push(
      "Import report is missing. Counts use what is currently on the site, not a full import ledger."
    );
  }

  if (!migrationLedger || !migrationReport) {
    anomalies.push({
      id: "missing_migration_artifacts",
      kind: "missing_artifact",
      blocking: false,
      subject: {},
      what_was_seen:
        "media-migration-ledger.json and/or media-migration-report.json are missing.",
      likely_effect:
        "Premium media cannot be proven privately migrated; soft public/media copies are not accepted as verification.",
      recommended_resolution:
        "Run migrate-media on this kit (memory adapter is enough for local audit)."
    });
    notes.push(
      "Degraded: migration ledger/report missing — premium media treated as unverified until migrate-media runs."
    );
    creator_notes.push(
      "Media migration has not been recorded. Premium files are not treated as privately verified."
    );
  }

  // --- Posts accounting ---
  // Mirror media honesty: expected floor covers live inventory (bundle + provenance).
  // Import-report counts alone must not greenwash silent bundle extras.
  let postsExpected = 0;
  let postsImported = 0;
  let postsExcluded = 0;
  let postsFailed = 0;

  type PostDisposition = "imported" | "excluded" | "failed" | "unknown";
  const postDisposition = new Map<string, PostDisposition>();

  if (importReport) {
    postsImported = importReport.posts.imported;
    postsExcluded = importReport.posts.excluded;
    postsFailed = importReport.posts.failed;
    for (const ex of importReport.exclusions) {
      if (ex.post_id && !ex.media_id) {
        exclusions.push({
          id: ex.id,
          disposition: "excluded",
          reason: ex.reason,
          post_id: ex.post_id
        });
        postDisposition.set(ex.post_id, "excluded");
      }
    }
    for (const fail of importReport.failures) {
      if (fail.post_id && !fail.media_id) {
        failures.push({
          id: fail.id,
          disposition: "failed",
          reason: fail.reason,
          post_id: fail.post_id
        });
        postDisposition.set(fail.post_id, "failed");
      }
    }
  } else if (bundle) {
    postsExpected = bundle.posts.length;
    postsImported = bundle.posts.length;
    postsExcluded = 0;
    postsFailed = 0;
  }

  // Live inventory that must be imported or failed (exclusions are separate rows).
  const livePostIds = new Set<string>();
  if (bundle) {
    for (const post of bundle.posts) livePostIds.add(post.post_id);
  }
  if (provenance) {
    for (const [postId, entry] of Object.entries(provenance.posts)) {
      if (postDisposition.get(postId) === "excluded") continue;
      livePostIds.add(postId);
      if (
        entry.upstream_status === "deleted" &&
        !postDisposition.has(postId)
      ) {
        postDisposition.set(postId, "failed");
      }
    }
  }

  // ID-level import evidence: every live post must be imported, excluded, or failed.
  const importedPostIds = new Set<string>();
  if (importState) {
    for (const id of importState.replay_ledger.imported_post_ids) {
      importedPostIds.add(id);
    }
    for (const id of Object.keys(importState.posts)) {
      importedPostIds.add(id);
    }
  }
  if (provenance) {
    for (const [postId, entry] of Object.entries(provenance.posts)) {
      if (entry.upstream_status === "active") {
        importedPostIds.add(postId);
      }
    }
  }

  const hasIdLevelPostEvidence =
    importedPostIds.size > 0 ||
    [...postDisposition.values()].some(
      (d) => d === "excluded" || d === "failed"
    );

  for (const postId of livePostIds) {
    if (postDisposition.has(postId)) continue;
    if (importedPostIds.has(postId)) {
      postDisposition.set(postId, "imported");
      continue;
    }
    if (hasIdLevelPostEvidence) {
      postDisposition.set(postId, "unknown");
    }
    // Count-only path (no ID evidence): leave unclassified and rely on the
    // expected-floor vs import imported/failed check to catch silent extras.
  }

  let postsAccountedImported = 0;
  let postsAccountedExcluded = 0;
  let postsAccountedFailed = 0;
  let postsUnknown = 0;
  for (const [postId, disp] of postDisposition) {
    if (disp === "imported") postsAccountedImported += 1;
    else if (disp === "excluded") postsAccountedExcluded += 1;
    else if (disp === "failed") postsAccountedFailed += 1;
    else {
      postsUnknown += 1;
      anomalies.push({
        id: `post_unaccounted_${postId}`,
        kind: "unaccounted_item",
        blocking: true,
        subject: { post_ids: [postId] },
        what_was_seen: `Post ${postId} appears in site/provenance inventory without an imported, excluded, or failed disposition in import artifacts.`,
        likely_effect: "Silent post inventory drift — not 100% accounted-for.",
        recommended_resolution:
          "Re-run import-relay-dump, or exclude the post with an explicit reason."
      });
    }
  }

  if (importReport) {
    const liveFromDisposition =
      postsAccountedImported + postsAccountedFailed;
    // Expected floor covers live inventory; deflated import cannot ignore extras.
    postsExpected = Math.max(
      importReport.posts.expected,
      livePostIds.size,
      liveFromDisposition
    );
    // Keep import-reported imported/failed when unknowns exist (silent extras).
    // Only adopt disposition imported/failed when every live post is classified.
    if (postsUnknown === 0 && postDisposition.size > 0) {
      postsImported = postsAccountedImported;
      postsFailed = postsAccountedFailed;
      postsExcluded = Math.max(postsExcluded, postsAccountedExcluded);
      postsExpected = Math.max(postsExpected, postsImported + postsFailed);
    } else {
      postsExcluded = Math.max(postsExcluded, postsAccountedExcluded);
    }
  } else if (postDisposition.size > 0) {
    postsExpected = postDisposition.size;
    postsImported = postsAccountedImported;
    postsExcluded = postsAccountedExcluded;
    postsFailed = postsAccountedFailed;
  }

  const postsAccountedLive = postsImported + postsFailed;
  // Import reports treat `expected` as non-excluded candidates; exclusions are
  // separately accounted rows (tombstones, mature, etc.), not part of expected.
  const postsFullyAccounted =
    postsUnknown === 0 &&
    (importReport
      ? postsAccountedLive === postsExpected &&
        postsExcluded ===
          importReport.exclusions.filter((e) => e.post_id && !e.media_id).length
      : postsImported + postsExcluded + postsFailed === postsExpected);
  if (!postsFullyAccounted) {
    anomalies.push({
      id: "posts_not_fully_accounted",
      kind: "unaccounted_item",
      blocking: true,
      subject: {},
      what_was_seen: `Posts expected=${postsExpected}, imported=${postsImported}, excluded=${postsExcluded}, failed=${postsFailed}, unaccounted=${postsUnknown} (live accounted=${postsAccountedLive}).`,
      likely_effect:
        "At least one post was silently dropped or added outside import accounting.",
      recommended_resolution:
        "Re-run import-relay-dump and inspect import-report.json, or exclude the missing posts explicitly after review."
    });
  }

  // Unaccounted import failures (report lists failures but counts disagree)
  if (importReport) {
    const listedFailPosts = importReport.failures.filter(
      (f) => f.post_id && !f.media_id
    ).length;
    if (postsFailed > 0 && listedFailPosts < postsFailed) {
      anomalies.push({
        id: "unaccounted_import_post_failures",
        kind: "unaccounted_import_failure",
        blocking: true,
        subject: {},
        what_was_seen: `Import report post failures count is ${postsFailed} but only ${listedFailPosts} failure rows list a post_id.`,
        likely_effect: "Some failed posts lack a reviewable reason.",
        recommended_resolution:
          "Re-run import and ensure every failure writes an accounted row with a reason."
      });
    }
  }

  // --- Media accounting ---
  let mediaExpected = 0;
  let mediaImported = 0;
  let mediaCopied = 0;
  let mediaVerified = 0;
  let mediaFailed = 0;
  let mediaMissing = 0;
  let mediaExcluded = 0;

  const mediaIds = new Set<string>();
  if (bundle) {
    for (const post of bundle.posts) {
      for (const m of post.media) mediaIds.add(m.media_id);
    }
  }
  if (provenance) {
    for (const id of Object.keys(provenance.media)) mediaIds.add(id);
  }
  if (importReport) {
    mediaExpected = Math.max(importReport.media.expected, mediaIds.size);
    mediaImported = importReport.media.imported;
    mediaFailed += importReport.media.failed;
    mediaMissing += importReport.media.missing_export;
    mediaExcluded += importReport.media.excluded;
    for (const ex of importReport.exclusions) {
      if (ex.media_id) {
        exclusions.push({
          id: ex.id,
          disposition: "excluded",
          reason: ex.reason,
          media_id: ex.media_id,
          ...(ex.post_id ? { post_id: ex.post_id } : {})
        });
      }
    }
    for (const fail of importReport.failures) {
      if (fail.media_id) {
        failures.push({
          id: fail.id,
          disposition: "failed",
          reason: fail.reason,
          media_id: fail.media_id,
          ...(fail.post_id ? { post_id: fail.post_id } : {})
        });
      }
    }
  } else {
    mediaExpected = mediaIds.size;
    mediaImported = mediaIds.size;
  }

  if (migrationReport) {
    mediaExpected = Math.max(mediaExpected, migrationReport.expected);
    mediaCopied = migrationReport.copied;
    mediaVerified = migrationReport.verified;
    mediaFailed = Math.max(mediaFailed, migrationReport.failed);
  }

  // Per-media disposition set for accounted-for
  type Disposition = "imported" | "excluded" | "failed" | "verified" | "unknown";
  const mediaDisposition = new Map<string, Disposition>();

  if (bundle) {
    for (const post of bundle.posts) {
      for (const m of post.media) {
        mediaDisposition.set(m.media_id, m.has_export ? "imported" : "failed");
      }
    }
  }
  if (importReport) {
    for (const ex of importReport.exclusions) {
      if (ex.media_id) mediaDisposition.set(ex.media_id, "excluded");
    }
    for (const fail of importReport.failures) {
      if (fail.media_id) mediaDisposition.set(fail.media_id, "failed");
    }
  }
  if (migrationLedger) {
    for (const [mediaId, entry] of Object.entries(migrationLedger.objects)) {
      if (entry.status === "verified" && entry.private_read_verified) {
        mediaDisposition.set(mediaId, "verified");
      } else if (entry.status === "failed") {
        mediaDisposition.set(mediaId, "failed");
        if (!failures.some((f) => f.media_id === mediaId)) {
          failures.push({
            id: `mig_fail_${mediaId}`,
            disposition: "failed",
            reason: entry.failure_reason ?? "Media migration failed.",
            media_id: mediaId
          });
        }
        // Premium/private failures block; public accounted failures stay reviewable but non-blocking.
        const blocking = entry.private_required === true;
        anomalies.push({
          id: `migration_failed_${mediaId}`,
          kind: "unaccounted_migration_failure",
          blocking,
          subject: { media_ids: [mediaId] },
          what_was_seen: `Migration ledger status=${entry.status}; reason=${entry.failure_reason ?? "(none)"}.`,
          likely_effect: blocking
            ? "This premium file will not be privately available in a production-ready handoff."
            : "This public file failed migration but is already listed as a failed accounted item.",
          recommended_resolution:
            "Retry migrate-media, restore the export blob, or exclude this media from the build."
        });
      } else if (entry.status === "skipped") {
        mediaDisposition.set(mediaId, "excluded");
      }
    }
  }

  // Premium media without verified migration / export
  if (bundle) {
    for (const post of bundle.posts) {
      const premium = isPremiumAccess(post.access.level);
      for (const m of post.media) {
        const ledgerEntry = migrationLedger?.objects[m.media_id];
        const verified =
          ledgerEntry?.status === "verified" &&
          ledgerEntry.private_read_verified === true;
        const hasSource = m.has_export === true;
        const excludedByImport = mediaDisposition.get(m.media_id) === "excluded";

        if (premium && !verified && !excludedByImport) {
          const noSource = !hasSource;
          const noMigrationProof = !verified;
          if (noSource || noMigrationProof) {
            const id = `premium_media_unverified_${m.media_id}`;
            if (!anomalies.some((a) => a.id === id)) {
              anomalies.push({
                id,
                kind: "premium_media_unverified",
                blocking: true,
                subject: {
                  media_ids: [m.media_id],
                  post_ids: [post.post_id]
                },
                what_was_seen: noSource
                  ? `Premium post “${post.title}” references media ${m.media_id} with has_export=false and no private-read verified migration entry.`
                  : `Premium media ${m.media_id} on “${post.title}” is not migration-verified (private_read_verified). public/media is not accepted as proof.`,
                likely_effect:
                  "Members could be promised a locked file that this build cannot privately deliver.",
                recommended_resolution:
                  "Restore the export blob and run migrate-media, or exclude this media from the build."
              });
            }
            if (noSource) {
              mediaDisposition.set(m.media_id, "failed");
            }
          }
        }
      }
    }
  }

  // Provenance media not present in bundle and not excluded/failed
  if (provenance) {
    for (const [mediaId, pm] of Object.entries(provenance.media)) {
      if (mediaDisposition.has(mediaId)) continue;
      if (pm.blob_missing || !pm.has_export) {
        mediaDisposition.set(mediaId, "failed");
        mediaMissing += 1;
      } else {
        mediaDisposition.set(mediaId, "unknown");
      }
    }
  }

  let mediaAccountedImported = 0;
  let mediaAccountedExcluded = 0;
  let mediaAccountedFailed = 0;
  let mediaUnknown = 0;
  for (const [mediaId, disp] of mediaDisposition) {
    if (disp === "imported" || disp === "verified") mediaAccountedImported += 1;
    else if (disp === "excluded") mediaAccountedExcluded += 1;
    else if (disp === "failed") mediaAccountedFailed += 1;
    else {
      mediaUnknown += 1;
      anomalies.push({
        id: `media_unaccounted_${mediaId}`,
        kind: "unaccounted_item",
        blocking: true,
        subject: { media_ids: [mediaId] },
        what_was_seen: `Media ${mediaId} appears in provenance/export inventory without an imported, excluded, or failed disposition.`,
        likely_effect: "Silent media loss — not 100% accounted-for.",
        recommended_resolution:
          "Re-run import and migrate-media, or exclude this media with an explicit reason."
      });
    }
  }

  // Prefer disposition-derived counts when we have a closed media set.
  // Import reports treat expected as non-excluded candidates; exclusions are extra rows.
  const dispositionTotal = mediaDisposition.size;
  if (dispositionTotal > 0) {
    const liveFromDisposition =
      mediaAccountedImported + mediaAccountedFailed;
    const excludedFromDisposition = mediaAccountedExcluded;
    if (importReport) {
      mediaExpected = Math.max(mediaExpected, liveFromDisposition);
      mediaImported = mediaAccountedImported;
      mediaExcluded = Math.max(mediaExcluded, excludedFromDisposition);
      mediaFailed = mediaAccountedFailed;
    } else {
      mediaExpected = dispositionTotal;
      mediaImported = mediaAccountedImported;
      mediaExcluded = mediaAccountedExcluded;
      mediaFailed = mediaAccountedFailed;
    }
  }

  const mediaFullyAccounted =
    mediaUnknown === 0 &&
    (importReport
      ? mediaImported + mediaFailed === mediaExpected &&
        mediaExcluded ===
          importReport.exclusions.filter((e) => Boolean(e.media_id)).length
      : mediaImported + mediaExcluded + mediaFailed === mediaExpected);

  if (!mediaFullyAccounted && mediaUnknown === 0) {
    anomalies.push({
      id: "media_not_fully_accounted",
      kind: "unaccounted_item",
      blocking: true,
      subject: {},
      what_was_seen: `Media expected=${mediaExpected}, imported/verified=${mediaImported}, excluded=${mediaExcluded}, failed=${mediaFailed}.`,
      likely_effect: "Media inventory does not close — some items are unexplained.",
      recommended_resolution:
        "Re-run import-relay-dump and migrate-media, then library-truth."
    });
  }

  // --- Attachments (media with non-image mime or role attachment) ---
  let attachmentsExpected = 0;
  if (bundle) {
    for (const post of bundle.posts) {
      for (const m of post.media) {
        const mime = m.mime_type ?? "";
        if (
          mime.startsWith("application/") ||
          mime.includes("pdf") ||
          mime.includes("zip")
        ) {
          attachmentsExpected += 1;
        }
      }
    }
  }
  const attachmentsAccounted = attachmentsExpected;

  // --- Tiers ---
  const tierCatalog =
    bundle?.tiers.map((t) => ({
      tier_id: t.tier_id,
      title: t.title,
      amount_cents: t.amount_cents
    })) ?? [];
  let tiersExpected = tierCatalog.length;
  let tiersMapped = tierCatalog.length;
  let tiersUnmapped = 0;
  if (importReport) {
    tiersExpected = importReport.tiers.expected;
    tiersMapped = importReport.tiers.mapped;
    tiersUnmapped = importReport.tiers.unmapped;
  }
  if (importState) {
    const mappingCount = Object.keys(importState.tier_mappings).length;
    if (mappingCount > 0) {
      notes.push(`Local tier mappings present: ${mappingCount}.`);
    }
  }
  if (tiersUnmapped > 0) {
    anomalies.push({
      id: "tiers_unmapped",
      kind: "tier_unmapped",
      blocking: false,
      subject: {},
      what_was_seen: `${tiersUnmapped} tier(s) remain unmapped in the import report.`,
      likely_effect: "Some paid access rules may not map to independent products later.",
      recommended_resolution:
        "Review tier mappings in Structure / Access map before billing setup."
    });
  }

  // --- Access ambiguities (never auto-pick paid tier by array order) ---
  if (bundle) {
    for (const post of bundle.posts) {
      if (post.access.level !== "tier_gated") continue;
      const ids = post.access.tier_ids;
      const unknownTiers = ids.filter(
        (id) => !bundle.tiers.some((t) => t.tier_id === id)
      );
      if (unknownTiers.length > 0) {
        anomalies.push({
          id: `access_unknown_tiers_${post.post_id}`,
          kind: "access_ambiguity",
          blocking: true,
          subject: { post_ids: [post.post_id], tier_ids: unknownTiers },
          what_was_seen: `Post “${post.title}” is tier-gated to unknown tier id(s): ${unknownTiers.join(", ")}.`,
          likely_effect:
            "Access simulation may hide or show the post incorrectly for real members.",
          recommended_resolution:
            "Map the tier to a catalog entry, fix the tier id, or exclude the post from this build."
        });
      }

      const prov = provenance?.posts[post.post_id];
      if (prov && prov.source_tier_ids.length > 1) {
        const paidSources = prov.source_tier_ids.filter(
          (id) => id !== "relay_tier_public" && id !== "relay_tier_all_patrons"
        );
        const snapshotMode = prov.access_snapshot.match_mode;
        // Ambiguous when multiple paid source tiers and snapshot only kept first id without explicit mode.
        if (
          paidSources.length > 1 &&
          (post.access.tier_ids.length === 1 || !snapshotMode)
        ) {
          anomalies.push({
            id: `access_ambiguous_${post.post_id}`,
            kind: "access_ambiguity",
            blocking: true,
            subject: {
              post_ids: [post.post_id],
              tier_ids: [...paidSources]
            },
            what_was_seen: `Post “${post.title}” had multiple source tier ids (${paidSources.join(", ")}) but the build kept ${post.access.tier_ids.join(", ") || "(none)"} without an explicit creator-confirmed match mode.`,
            likely_effect:
              "Picking a paid tier by array order can lock out legitimate patrons or open content too widely.",
            recommended_resolution:
              "Confirm exact tier vs tier-or-higher in Access map, or exclude the post until access is clarified."
          });
        }
      }

      // Multiple tier_ids without match_mode is ambiguous for exact vs higher.
      if (ids.length > 1 && !post.access.match_mode) {
        anomalies.push({
          id: `access_multi_tier_no_mode_${post.post_id}`,
          kind: "access_ambiguity",
          blocking: true,
          subject: { post_ids: [post.post_id], tier_ids: [...ids] },
          what_was_seen: `Post “${post.title}” lists multiple tier ids without an explicit match mode.`,
          likely_effect:
            "The site cannot honestly say whether members need every listed tier or any one of them at a floor.",
          recommended_resolution:
            "Set exact tier or tier-or-higher explicitly, or exclude the post from this build."
        });
      }
    }
  }

  // Conflicts
  const conflicts: LibraryParityReport["conflicts"] = [];
  const conflictSource =
    importState?.conflict_queue ?? importReport?.conflicts ?? [];
  for (const c of conflictSource) {
    conflicts.push({
      id: c.id,
      kind: c.kind,
      summary: c.summary,
      recommended_action: c.recommended_action,
      ...(c.post_id ? { post_id: c.post_id } : {}),
      ...(c.media_id ? { media_id: c.media_id } : {}),
      ...(c.tier_id ? { tier_id: c.tier_id } : {})
    });
    anomalies.push({
      id: `conflict_${c.id}`,
      kind: "conflict_unresolved",
      blocking: false,
      subject: {
        ...(c.post_id ? { post_ids: [c.post_id] } : {}),
        ...(c.media_id ? { media_ids: [c.media_id] } : {}),
        ...(c.tier_id ? { tier_ids: [c.tier_id] } : {})
      },
      what_was_seen: c.summary,
      likely_effect:
        "Local edits and upstream imports may disagree until you choose a side.",
      recommended_resolution: c.recommended_action
    });
  }

  // Import exclusion informational anomalies
  for (const ex of exclusions) {
    anomalies.push({
      id: `info_excl_${ex.id}`,
      kind: "import_exclusion",
      blocking: false,
      subject: {
        ...(ex.post_id ? { post_ids: [ex.post_id] } : {}),
        ...(ex.media_id ? { media_ids: [ex.media_id] } : {})
      },
      what_was_seen: ex.reason,
      likely_effect: "Item is intentionally out of this build inventory.",
      recommended_resolution: "No action unless you want it included — re-import after fixing source."
    });
  }

  const access_buckets = bundle ? buildAccessBuckets(bundle) : [];
  const access_simulations = bundle ? buildAccessSimulations(bundle) : [];
  const access_notes = [
    "Access simulation is a soft client preview only — not patron entitlements or server authorization.",
    "Exact tier: only members on the listed tier can open the post.",
    "Tier or higher: members on the listed tier or any tier priced above it can open the post.",
    "Do not treat public/media or persona unlock as private delivery proof (EH-033)."
  ];

  notes.push(
    "production_safe is false. Library truth is a prototype audit console, not private media delivery."
  );
  creator_notes.push(
    `${identity.display_name} (@${identity.handle}): ${postsImported} posts in build, ${postsExcluded} excluded, ${postsFailed} failed.`
  );
  creator_notes.push(
    `Media: ${mediaVerified || mediaImported} ready or present, ${mediaExcluded} excluded, ${mediaFailed} failed, ${mediaMissing} missing exports.`
  );
  if (anomalies.some((a) => a.blocking)) {
    creator_notes.push(
      "Blocking issues remain. Resolve each one or choose Exclude from this build before marking library truth complete."
    );
  }

  const posts = {
    expected: postsExpected,
    imported: postsImported,
    excluded: postsExcluded,
    failed: postsFailed,
    fully_accounted: postsFullyAccounted
  };
  const media = {
    expected: mediaExpected,
    imported: mediaImported,
    copied: mediaCopied,
    verified: mediaVerified,
    failed: mediaFailed,
    missing: mediaMissing,
    excluded: mediaExcluded,
    fully_accounted: mediaFullyAccounted
  };

  const reportBase: LibraryParityReport = {
    contract_version: LIBRARY_PARITY_REPORT_CONTRACT_VERSION,
    site_id,
    creator_id,
    generated_at,
    production_safe: false,
    artifacts,
    identity,
    posts,
    media,
    attachments: {
      expected: attachmentsExpected,
      accounted: attachmentsAccounted
    },
    tiers: {
      expected: tiersExpected,
      mapped: tiersMapped,
      unmapped: tiersUnmapped,
      catalog: tierCatalog
    },
    exclusions,
    failures,
    conflicts,
    anomalies,
    access_buckets,
    access_simulations,
    access_notes,
    gate: {
      fully_accounted: postsFullyAccounted && mediaFullyAccounted,
      blocking_anomaly_ids: [],
      unresolved_blocking_count: 0,
      can_continue_without_exclusions: false
    },
    creator_notes,
    notes
  };

  const gateEval = evaluateContinueGate(reportBase, input.state ?? null);
  reportBase.gate = {
    fully_accounted: gateEval.fully_accounted,
    blocking_anomaly_ids: gateEval.blocking_anomaly_ids,
    unresolved_blocking_count: gateEval.unresolved_blocking_ids.length,
    can_continue_without_exclusions:
      gateEval.can_continue && gateEval.excluded_blocking_ids.length === 0
  };

  return reportBase;
}

/** Test helper: force an unaccounted media disposition scenario. */
export function __mediaAccessClassForTests(
  post: ClonePostEntry | undefined
): string {
  return mediaAccessClass(post);
}

export function __findPostsForMediaForTests(
  bundle: SiteBundle,
  mediaId: string
): ClonePostEntry[] {
  return findPostsForMedia(bundle, mediaId);
}
