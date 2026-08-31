/**
 * RC-P1-T01 — read-only characterization of Gallery / collections / presentation /
 * native create / distribution / schedule-rail / idempotency / tenant seams.
 * Documents reusable services and conflicts for Phase 2. Does not change production behavior.
 *
 * @see docs/studio/relay-command-mcp-build-plans/01-PHASE-1-CONTENT-FOUNDATION.md
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { itemMatchesFreeTextQuery, listGalleryItems } from "../../../src/gallery/query.js";
import { mergePostPresentation } from "../../../src/gallery/effective-presentation.js";
import { FileCollectionsStore } from "../../../src/gallery/collections-store.js";
import { DbCollectionsStore } from "../../../src/gallery/collections-store-db.js";
import type { GalleryItem } from "../../../src/gallery/types.js";
import { createRelayPostTransaction } from "../../../src/relay/create-relay-post.js";
import {
  createPostDistributionPlan,
  getPostDistributionSummary,
  startDistributionHandoff,
  completeDistributionAttempt
} from "../../../src/distribution/post-distribution-service.js";
import {
  createScheduledPostForRail,
  getCreatorScheduleRail,
  publishScheduleRailReviewPost
} from "../../../src/distribution/schedule-rail-service.js";
import { saveAutopostDraft } from "../../../src/autopost/autopost-draft-service.js";
import { loadEffectivePostSource } from "../../../src/distribution/effective-post-source.js";
import { InMemoryIdempotencyStore } from "../../../src/middleware/idempotency-store.js";
import { loadAccountContextForSession } from "../../../src/identity/require-account.js";
import { COMMAND_WRITE_LAYERS } from "../../../src/studio/command/contracts.js";
import {
  COMMAND_P2_NATIVE_DRAFT_HTTP,
  resolveCreatorCommandContext
} from "../../../src/studio/command/creator-context.js";
import {
  beginCommandIdempotency,
  createCommandIdempotencyStore,
  recordCommandIdempotency
} from "../../../src/studio/command/idempotency.js";
import type { PrismaClient } from "@prisma/client";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..", "..");

function readSrc(rel: string): string {
  return readFileSync(join(repoRoot, rel), "utf8");
}

function galleryItem(overrides: Partial<GalleryItem> = {}): GalleryItem {
  return {
    media_id: "media_1",
    post_id: "post_1",
    title: "Hero Academy Page 1",
    published_at: "2026-01-02T00:00:00.000Z",
    tag_ids: ["tag_watercolor"],
    tier_ids: [],
    has_export: true,
    processing_status: "READY",
    export_status: "ready",
    content_url_path: "/x",
    preview_url_path: "/p",
    thumb_url_path: "/t",
    visibility: "visible",
    collection_ids: ["col_ha"],
    collection_theme_tag_ids: [],
    ...overrides
  };
}

describe("Relay Command spine characterization (RC-P1-T01)", () => {
  it("exposes gallery search: AND tokens + exact tag_ids AND + date range", () => {
    expect(typeof itemMatchesFreeTextQuery).toBe("function");
    expect(typeof listGalleryItems).toBe("function");

    const watercolor = galleryItem({
      post_id: "post_w",
      title: "Misty watercolor study",
      tag_ids: ["tag_watercolor"]
    });
    const landscape = galleryItem({
      post_id: "post_l",
      media_id: "media_l",
      title: "Mountain landscape",
      tag_ids: ["tag_landscape"],
      published_at: "2025-01-01T00:00:00.000Z"
    });

    expect(itemMatchesFreeTextQuery(watercolor, "watercolor")).toBe(true);
    expect(itemMatchesFreeTextQuery(watercolor, "watercolor missingtoken")).toBe(false);

    const tagged = listGalleryItems([watercolor, landscape], {
      creator_id: "cr_lab",
      tag_ids: ["tag_watercolor"],
      limit: 20
    });
    expect(tagged.items.map((i) => i.post_id)).toEqual(["post_w"]);

    const ranged = listGalleryItems([watercolor, landscape], {
      creator_id: "cr_lab",
      published_after: "2026-01-01T00:00:00.000Z",
      limit: 20
    });
    expect(ranged.items.map((i) => i.post_id)).toEqual(["post_w"]);
  });

  it("records GalleryItem destination_summary / collection_ids and missing Post.source", () => {
    const typesSrc = readSrc("src/gallery/types.ts");
    expect(typesSrc).toMatch(/distribution_summary\?:/);
    expect(typesSrc).toMatch(/collection_ids: string\[\]/);
    expect(typesSrc).toMatch(/member_label\?: string \| null/);
    expect(typesSrc).toMatch(/origin_source\?: string \| null/);
    // Command selection `source` cannot be served from GalleryItem today — use Prisma Post.source.
    expect(typesSrc).not.toMatch(/^\s+source\?:/m);
    const listParams = typesSrc.slice(
      typesSrc.indexOf("export type GalleryListParams"),
      typesSrc.indexOf("export type GalleryListResult")
    );
    expect(listParams).not.toMatch(/collection_id/);
    expect(listParams).not.toMatch(/destination_present/);
  });

  it("exposes collection CRUD + membership add/remove; reorder is collection-list not membership", () => {
    expect(typeof FileCollectionsStore).toBe("function");
    expect(typeof DbCollectionsStore).toBe("function");
    const storeSrc = readSrc("src/gallery/collections-store.ts");
    expect(storeSrc).toMatch(/create\(/);
    expect(storeSrc).toMatch(/update\(/);
    expect(storeSrc).toMatch(/addPosts\(/);
    expect(storeSrc).toMatch(/removePosts\(/);
    expect(storeSrc).toMatch(/reorder\(creatorId: string, orderedIds: string\[\]\)/);
    expect(storeSrc).toMatch(/col\.sort_order = i/);
    expect(storeSrc).not.toMatch(/setMembershipOrder|setPostOrder|sortIndex/);

    const dbSrc = readSrc("src/gallery/collections-store-db.ts");
    expect(dbSrc).toMatch(/sortIndex: maxIdx \+ 1 \+ i/);
    expect(dbSrc).toMatch(/libraryCollection\.updateMany/);

    const serverSrc = readSrc("src/server.ts");
    expect(serverSrc).toMatch(/app\.post\("\/api\/v1\/gallery\/collections"/);
    expect(serverSrc).toMatch(/app\.patch\("\/api\/v1\/gallery\/collections\/:collection_id"/);
    expect(serverSrc).toMatch(/app\.post\("\/api\/v1\/gallery\/collections\/:collection_id\/posts"/);
    expect(serverSrc).toMatch(/app\.post\("\/api\/v1\/gallery\/collections\/reorder"/);
  });

  it("exposes presentation overlay merge and PATCH without touching canonical PostVersion", () => {
    const merged = mergePostPresentation(
      { title: "Patreon title", description: "origin", media_ids: ["m1"] },
      { relay_title: "Relay gallery title" }
    );
    expect(merged.title).toBe("Relay gallery title");

    const serverSrc = readSrc("src/server.ts");
    expect(serverSrc).toMatch(/app\.patch\("\/api\/v1\/gallery\/posts\/:post_id\/presentation"/);
    expect(serverSrc).toMatch(/Does not touch canonical ingest/);
    expect(COMMAND_WRITE_LAYERS).toContain("presentation");
  });

  it("exposes native create with draft publishedAt:null; HTTP rejects publish:false", () => {
    expect(typeof createRelayPostTransaction).toBe("function");
    const createSrc = readSrc("src/relay/create-relay-post.ts");
    expect(createSrc).toMatch(/publish: boolean/);
    expect(createSrc).toMatch(/PostPublishState\.draft/);
    expect(createSrc).toMatch(/publishedAt = null/);
    expect(createSrc).toMatch(/source:\s*PostSource\.RELAY/);

    const serverSrc = readSrc("src/server.ts");
    expect(serverSrc).toMatch(/DRAFT_NOT_SUPPORTED/);
    expect(serverSrc).toMatch(/Pass publish: true/);
    expect(serverSrc).not.toMatch(/app\.patch\("\/api\/v1\/relay\/posts\/:post_id"/);

    const routeTest = readSrc("tests/relay-native-post-route.test.ts");
    expect(routeTest).toMatch(/DRAFT_NOT_SUPPORTED/);
  });

  it("exposes distribution plan create + summary (destination present/absent input for P2)", () => {
    expect(typeof createPostDistributionPlan).toBe("function");
    expect(typeof getPostDistributionSummary).toBe("function");
    expect(typeof startDistributionHandoff).toBe("function");
    expect(typeof completeDistributionAttempt).toBe("function");
    expect(typeof loadEffectivePostSource).toBe("function");

    const distSrc = readSrc("src/distribution/post-distribution-service.ts");
    expect(distSrc).toMatch(/export type DistributionSummaryWire/);
    expect(distSrc).toMatch(/attempt_status/);
    expect(distSrc).not.toMatch(/auto.?publish|autonomous.?publish/i);

    const typesSrc = readSrc("src/gallery/types.ts");
    expect(typesSrc).toMatch(/attempt_status: string \| null/);
  });

  it("exposes schedule-rail create/list and a separate human publish confirm path", () => {
    expect(typeof getCreatorScheduleRail).toBe("function");
    expect(typeof createScheduledPostForRail).toBe("function");
    expect(typeof saveAutopostDraft).toBe("function");
    expect(typeof publishScheduleRailReviewPost).toBe("function");

    const railSrc = readSrc("src/distribution/schedule-rail-service.ts");
    expect(railSrc).toMatch(/createRelayPostTransaction/);
    expect(railSrc).toMatch(/publish:\s*false/);
    const serverSrc = readSrc("src/server.ts");
    expect(serverSrc).toMatch(/\/api\/v1\/creator\/schedule-rail\/events/);
    expect(serverSrc).toMatch(/\/api\/v1\/creator\/schedule-rail\/review\/:event_id\/publish/);
  });

  it("records in-memory idempotency store with body-hash conflict (not Command Layer durable yet)", () => {
    expect(typeof InMemoryIdempotencyStore).toBe("function");
    const storeSrc = readSrc("src/middleware/idempotency-store.ts");
    expect(storeSrc).toMatch(/export interface IdempotencyStore/);
    expect(storeSrc).toMatch(/class InMemoryIdempotencyStore/);
    expect(storeSrc).toMatch(/bodyHash/);
    const mwSrc = readSrc("src/middleware/idempotency-middleware.ts");
    expect(mwSrc).toMatch(/IDEMPOTENCY_KEY_REUSE/);
    expect(mwSrc).toMatch(/body_mismatch/);
  });

  it("records creator context path and fail-open skip when prisma is unset (do not copy into facade)", () => {
    expect(typeof loadAccountContextForSession).toBe("function");
    const requireSrc = readSrc("src/identity/require-account.ts");
    expect(requireSrc).toMatch(/primaryRelayCreatorId/);
    const serverSrc = readSrc("src/server.ts");
    expect(serverSrc).toMatch(/async function requireAccountMatchesCreator/);
    expect(serverSrc).toMatch(/if \(!config\.prisma\) \{\s*return true;/s);
  });

  it("records dual RELAY_DB_STORE_* flags and SessionKind without mcp", () => {
    const envSrc = readSrc(".env.example");
    expect(envSrc).toMatch(/RELAY_DB_STORE_CANONICAL/);
    expect(envSrc).toMatch(/RELAY_DB_STORE_COLLECTIONS/);
    expect(envSrc).toMatch(/RELAY_DB_STORE_IDENTITY/);
    const schema = readSrc("prisma/schema.prisma");
    expect(schema).toMatch(/enum SessionKind/);
    expect(schema).toMatch(/web\s+@map\("web"\)/);
    expect(schema).toMatch(/extension\s+@map\("extension"\)/);
    expect(schema).not.toMatch(/mcp\s+@map\("mcp"\)/);
    expect(schema).toMatch(/enum PostSource/);
    expect(schema).toMatch(/PATREON/);
    expect(schema).toMatch(/SUBSCRIBESTAR/);
    expect(schema).toMatch(/RELAY/);
  });

  it("names RC-DF-10 write-layer facts and P2 seam gaps for Delta Out", () => {
    const facts = {
      imported_revise:
        "RC-DF-10: PATREON/SUBSCRIBESTAR title/description edits → PostPresentation overlay via PATCH /api/v1/gallery/posts/:post_id/presentation + mergePostPresentation. Canonical PostVersion stays append-only from sync.",
      native_revise:
        "RC-DF-10: RELAY native title edits must append PostVersion. No PATCH /api/v1/relay/posts/:post_id exists. createRelayPostTransaction supports publish:false (null publishedAt); HTTP POST /api/v1/relay/posts returns DRAFT_NOT_SUPPORTED. P2 playground should prefer imported presentation + a few RELAY posts created with publish:true unless native revise needs a new append-version service (RC-P1-T05 / T08).",
      collections:
        "LibraryCollection via FileCollectionsStore / DbCollectionsStore. Membership order is Collection.post_ids / CollectionPost.sortIndex. addPosts appends; reorder() reorders collections among themselves, not members. set_collection_order needs a store method in P2 (RC-P2-T05).",
      distribution:
        "createPostDistributionPlan + getPostDistributionSummary. GalleryItem.distribution_summary.attempt_status is the destination_present/absent signal. completeDistributionAttempt remains the human publish boundary.",
      schedule:
        "createScheduledPostForRail materializes draft Relay post + plan + variant + task. publishScheduleRailReviewPost is the confirm path — Command Layer must not call it as apply.",
      search_gaps:
        "itemMatchesFreeTextQuery + listGalleryItems tag AND / date range. GalleryItem has no Post.source; GalleryListParams has no collection_id or destination_present. Command search_library (RC-P1-T03) filters in-memory over compact records, not by wrapping server.ts.",
      idempotency:
        "IdempotencyStore is async and in-memory by default. Middleware hashes bodies and 422s on mismatch. P2 apply should wrap the same interface (RC-P1-T07) rather than a second Map.",
      tenant:
        "Account.primaryRelayCreatorId via loadAccountContextForSession. requireAccountMatchesCreator in server.ts returns true when !prisma — Command facade must fail closed if prisma is missing (RC-P1-T07/T08).",
      dual_store:
        "RELAY_DB_STORE_CANONICAL / COLLECTIONS / IDENTITY / OVERRIDES still exist. Command Layer must call the same stores the gallery HTTP routes use, not fork JSON copies.",
      session_kind:
        "Prisma SessionKind is web | extension only. MCP uses command_grants (hashed rcmd_ tokens), not Session.kind=mcp.",
      presentation_no_source_gate:
        "PATCH /api/v1/gallery/posts/:post_id/presentation does not check Post.source — it can overlay RELAY-native posts. P2 apply must use routePostRevision, not raw presentation HTTP, for native revise (RC-DF-10).",
      native_http_publish_one_shot:
        "POST /api/v1/relay/posts with publish:true calls createRelayPostTransaction and publishes in one request. Command Layer must treat that as publish_confirm and must not use it as apply. createScheduledPostForRail uses service publish:false and bypasses DRAFT_NOT_SUPPORTED."
    };
    expect(facts.imported_revise).toMatch(/PostPresentation/);
    expect(facts.native_revise).toMatch(/DRAFT_NOT_SUPPORTED/);
    expect(facts.collections).toMatch(/sortIndex/);
    expect(facts.tenant).toMatch(/fail closed/);
    expect(facts.presentation_no_source_gate).toMatch(/routePostRevision/);
    expect(facts.native_http_publish_one_shot).toMatch(/publish_confirm/);
    expect(Object.keys(facts).length).toBeGreaterThanOrEqual(8);
  });

  it("records presentation PATCH has no Post.source gate and native HTTP create is one-shot publish", () => {
    const mutateSrc = readSrc("src/gallery/post-presentation-mutate.ts");
    expect(mutateSrc).not.toMatch(/PostSource/);
    const serverSrc = readSrc("src/server.ts");
    const presStart = serverSrc.indexOf('app.patch("/api/v1/gallery/posts/:post_id/presentation"');
    const presEnd = serverSrc.indexOf("app.patch(\"/api/v1/gallery/posts/:post_id/audience-access\"");
    expect(presStart).toBeGreaterThan(-1);
    expect(presEnd).toBeGreaterThan(presStart);
    const presentationHandler = serverSrc.slice(presStart, presEnd);
    expect(presentationHandler).toMatch(/postPresentation\.upsert|PostPresentationUncheckedCreateInput/);
    expect(presentationHandler).not.toMatch(/PostSource|post\.source/);

    const createStart = serverSrc.indexOf('app.post("/api/v1/relay/posts"');
    const createEnd = serverSrc.indexOf('app.delete("/api/v1/relay/posts/:post_id"');
    expect(createStart).toBeGreaterThan(-1);
    const createHandler = serverSrc.slice(createStart, createEnd > createStart ? createEnd : createStart + 4000);
    expect(createHandler).toMatch(/DRAFT_NOT_SUPPORTED/);
    expect(createHandler).toMatch(/createRelayPostTransaction/);
  });
});

describe("Command idempotency + creator context (RC-P1-T07 / T08)", () => {
  it("replays the same key+body and conflicts on a different body", async () => {
    const store = createCommandIdempotencyStore();
    const key = "idem_ha_pages";
    const body = { instruction: "organize", post_ids: ["a", "b"] };
    const first = await beginCommandIdempotency(store, { scope: "command.apply", key, body });
    expect(first.state).toBe("fresh");
    await recordCommandIdempotency(store, {
      scope: "command.apply",
      key,
      body,
      status: 200,
      responseBody: { change_set_id: "cs_1" }
    });
    const replay = await beginCommandIdempotency(store, { scope: "command.apply", key, body });
    expect(replay.state).toBe("replay");
    if (replay.state === "replay") {
      expect(replay.snapshot.body).toEqual({ change_set_id: "cs_1" });
    }
    await expect(
      beginCommandIdempotency(store, {
        scope: "command.apply",
        key,
        body: { instruction: "organize", post_ids: ["a", "injected"] }
      })
    ).rejects.toMatchObject({ code: "COMMAND_VALIDATION" });
  });

  it("fails closed when prisma is missing and mismatches creator_id", async () => {
    await expect(
      resolveCreatorCommandContext({
        prisma: null,
        account: { accountId: "acc_1", primaryRelayCreatorId: "cr_1" }
      })
    ).rejects.toMatchObject({ code: "COMMAND_FORBIDDEN" });

    const prisma = {} as PrismaClient;
    const ctx = await resolveCreatorCommandContext({
      prisma,
      account: { accountId: "acc_1", primaryRelayCreatorId: "cr_lab2" },
      requestedCreatorId: "cr_lab2",
      traceId: "trace_t07"
    });
    expect(ctx).toMatchObject({
      accountId: "acc_1",
      creatorId: "cr_lab2",
      traceId: "trace_t07"
    });

    await expect(
      resolveCreatorCommandContext({
        prisma,
        account: { accountId: "acc_1", primaryRelayCreatorId: "cr_lab2" },
        requestedCreatorId: "cr_other"
      })
    ).rejects.toMatchObject({ code: "COMMAND_FORBIDDEN" });
  });

  it("keeps HTTP drafts blocked for P2 and records tenant + flag seams", () => {
    expect(COMMAND_P2_NATIVE_DRAFT_HTTP).toBe("keep_draft_not_supported");
    const envSrc = readSrc(".env.example");
    expect(envSrc).toMatch(/^RELAY_COMMAND_LAYER_ENABLED=false$/m);
    expect(envSrc).toMatch(/^RELAY_COMMAND_APPLY_ENABLED=false$/m);
    expect(envSrc).toMatch(/^RELAY_COMMAND_MCP_ENABLED=false$/m);
    expect(envSrc).toMatch(/^RELAY_COMMAND_STUDIO_UX_ENABLED=false$/m);
    const tenantTest = readSrc("tests/relay-creator-tenant-authz.test.ts");
    expect(tenantTest).toMatch(/primaryRelayCreatorId/);
    expect(tenantTest).toMatch(/body\.creator_id/);
  });
});
