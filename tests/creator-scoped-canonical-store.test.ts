import { describe, expect, it, vi, beforeEach } from "vitest";
import type {
  CanonicalSnapshot,
  PostVersionRow,
  CampaignRow,
  TierRow,
  PostRow,
  MediaRow
} from "../src/ingest/canonical-store.js";
import { DbCanonicalStore } from "../src/ingest/canonical-store-db.js";

/* ------------------------------------------------------------------ */
/*  Helpers — mock Prisma and build fixture snapshots                  */
/* ------------------------------------------------------------------ */

function versionRow(overrides: Partial<PostVersionRow> = {}): PostVersionRow {
  return {
    version_seq: 1,
    upstream_revision: "rev:1",
    title: "Post title",
    published_at: "2026-04-01T12:00:00.000Z",
    tag_ids: [],
    tier_ids: ["relay_tier_public"],
    media_ids: [],
    ingested_at: "2026-04-01T12:00:00.000Z",
    ...overrides
  };
}

function campaign(creatorId: string, campaignId: string): CampaignRow {
  return {
    campaign_id: campaignId,
    creator_id: creatorId,
    name: `Campaign ${campaignId}`,
    upstream_updated_at: "2026-01-01T00:00:00.000Z",
    version_seq: 1
  };
}

function tier(creatorId: string, tierId: string, campaignId: string): TierRow {
  return {
    tier_id: tierId,
    creator_id: creatorId,
    campaign_id: campaignId,
    title: `Tier ${tierId}`,
    upstream_updated_at: "2026-01-01T00:00:00.000Z",
    version_seq: 1
  };
}

function post(creatorId: string, postId: string): PostRow {
  const v = versionRow();
  return {
    post_id: postId,
    creator_id: creatorId,
    current: v,
    versions: [v],
    upstream_status: "active"
  };
}

function media(creatorId: string, mediaId: string, postId: string): MediaRow {
  return {
    media_id: mediaId,
    creator_id: creatorId,
    post_ids: [postId],
    upstream_status: "active",
    current: {
      version_seq: 1,
      upstream_revision: "rev:1",
      mime_type: "image/jpeg",
      upstream_url: "https://cdn.example.com/img.jpg",
      ingested_at: "2026-04-01T12:00:00.000Z"
    },
    versions: [{
      version_seq: 1,
      upstream_revision: "rev:1",
      mime_type: "image/jpeg",
      upstream_url: "https://cdn.example.com/img.jpg",
      ingested_at: "2026-04-01T12:00:00.000Z"
    }]
  };
}

function creatorSnapshot(creatorId: string, campaignId: string): CanonicalSnapshot {
  const postId = `post_${creatorId}_1`;
  const mediaId = `media_${creatorId}_1`;
  return {
    ingest_idempotency: {},
    campaigns: { [creatorId]: { [campaignId]: campaign(creatorId, campaignId) } },
    tiers: { [creatorId]: { relay_tier_public: tier(creatorId, "relay_tier_public", campaignId) } },
    posts: { [creatorId]: { [postId]: post(creatorId, postId) } },
    media: { [creatorId]: { [mediaId]: media(creatorId, mediaId, postId) } }
  };
}

type MockTx = Record<string, Record<string, ReturnType<typeof vi.fn>>>;

function createMockTx(): MockTx {
  return {
    postTier: { deleteMany: vi.fn().mockResolvedValue({}), createMany: vi.fn().mockResolvedValue({}) },
    mediaAsset: { deleteMany: vi.fn().mockResolvedValue({}), createMany: vi.fn().mockResolvedValue({}) },
    postVersion: { deleteMany: vi.fn().mockResolvedValue({}) },
    post: {
      deleteMany: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({})
    },
    tier: { deleteMany: vi.fn().mockResolvedValue({}), createMany: vi.fn().mockResolvedValue({}) },
    campaign: {
      deleteMany: vi.fn().mockResolvedValue({}),
      createMany: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([])
    },
    ingestIdempotencyKey: { deleteMany: vi.fn().mockResolvedValue({}), createMany: vi.fn().mockResolvedValue({}) }
  };
}

/* ------------------------------------------------------------------ */
/*  Test: Creator-scoped save isolation                               */
/* ------------------------------------------------------------------ */

describe("DbCanonicalStore creator-scoped operations", () => {
  let captured: { table: string; where: unknown }[];
  let tx: MockTx;

  beforeEach(() => {
    captured = [];
    tx = createMockTx();
    for (const [table, methods] of Object.entries(tx)) {
      const dm = methods.deleteMany;
      if (dm) {
        dm.mockImplementation(async (args?: { where?: unknown }) => {
          captured.push({ table, where: args?.where });
          return {};
        });
      }
    }
  });

  function makePrisma() {
    return {
      $transaction: vi.fn(async (fn: (tx: unknown) => Promise<void>, _opts?: unknown) => fn(tx))
    };
  }

  it("saveForCreator only deletes rows for the target creator", async () => {
    const prisma = makePrisma();
    const store = new DbCanonicalStore(prisma as never);
    const snap = creatorSnapshot("creator_A", "campaign_A");

    await store.saveForCreator("creator_A", snap);

    const campaignDelete = captured.find((c) => c.table === "campaign");
    expect(campaignDelete).toBeDefined();
    expect(campaignDelete!.where).toEqual({ creatorId: "creator_A" });

    const tierDelete = captured.find((c) => c.table === "tier");
    expect(tierDelete).toBeDefined();
    expect(tierDelete!.where).toEqual({ creatorId: "creator_A" });

    const postDelete = captured.find((c) => c.table === "post");
    expect(postDelete).toBeDefined();
    expect(postDelete!.where).toEqual({ creatorId: "creator_A" });

    const mediaDelete = captured.find((c) => c.table === "mediaAsset");
    expect(mediaDelete).toBeDefined();
    expect(mediaDelete!.where).toEqual({ creatorId: "creator_A" });
  });

  it("saveForCreator inserts the correct campaign and post data", async () => {
    const prisma = makePrisma();
    const store = new DbCanonicalStore(prisma as never);
    const snap = creatorSnapshot("creator_B", "campaign_B");

    await store.saveForCreator("creator_B", snap);

    const campaignCreate = tx.campaign.createMany;
    expect(campaignCreate).toHaveBeenCalledTimes(1);
    const campaignData = campaignCreate.mock.calls[0]![0] as { data: { id: string; creatorId: string }[] };
    expect(campaignData.data).toHaveLength(1);
    expect(campaignData.data[0]!.id).toBe("campaign_B");
    expect(campaignData.data[0]!.creatorId).toBe("creator_B");

    const postCreate = tx.post.create;
    expect(postCreate).toHaveBeenCalledTimes(1);
    const postArg = postCreate.mock.calls[0]![0] as { data: { id: string; creatorId: string } };
    expect(postArg.data.id).toBe("post_creator_B_1");
    expect(postArg.data.creatorId).toBe("creator_B");
  });

  it("saveForCreator inserts media assets correctly", async () => {
    const prisma = makePrisma();
    const store = new DbCanonicalStore(prisma as never);
    const snap = creatorSnapshot("creator_C", "campaign_C");

    await store.saveForCreator("creator_C", snap);

    const mediaCreate = tx.mediaAsset.createMany;
    expect(mediaCreate).toHaveBeenCalledTimes(1);
    const mediaData = mediaCreate.mock.calls[0]![0] as { data: { id: string; creatorId: string }[] };
    expect(mediaData.data).toHaveLength(1);
    expect(mediaData.data[0]!.id).toBe("media_creator_C_1");
    expect(mediaData.data[0]!.creatorId).toBe("creator_C");
  });

  it("save() delegates to per-creator saves for each creator in snapshot", async () => {
    const prisma = makePrisma();
    const store = new DbCanonicalStore(prisma as never);

    const snapA = creatorSnapshot("creator_A", "campaign_A");
    const snapB = creatorSnapshot("creator_B", "campaign_B");
    const combined: CanonicalSnapshot = {
      ingest_idempotency: {},
      campaigns: { ...snapA.campaigns, ...snapB.campaigns },
      tiers: { ...snapA.tiers, ...snapB.tiers },
      posts: { ...snapA.posts, ...snapB.posts },
      media: { ...snapA.media, ...snapB.media }
    };

    await store.save(combined);

    expect(prisma.$transaction).toHaveBeenCalledTimes(2);

    const campaignDeletes = captured.filter((c) => c.table === "campaign");
    expect(campaignDeletes).toHaveLength(2);
    const deletedCreators = campaignDeletes.map((c) => (c.where as { creatorId: string }).creatorId).sort();
    expect(deletedCreators).toEqual(["creator_A", "creator_B"]);
  });

  it("saveForCreator handles empty snapshot gracefully", async () => {
    const prisma = makePrisma();
    const store = new DbCanonicalStore(prisma as never);
    const empty: CanonicalSnapshot = {
      ingest_idempotency: {},
      campaigns: {},
      tiers: {},
      posts: {},
      media: {}
    };

    await store.saveForCreator("creator_X", empty);

    expect(tx.campaign.createMany).not.toHaveBeenCalled();
    expect(tx.tier.createMany).not.toHaveBeenCalled();
    expect(tx.post.create).not.toHaveBeenCalled();
    expect(tx.mediaAsset.createMany).not.toHaveBeenCalled();
  });
});

/* ------------------------------------------------------------------ */
/*  Test: Multi-tenant isolation — saving one creator doesn't wipe     */
/*  another creator's data (verifies the WHERE clause scoping)        */
/* ------------------------------------------------------------------ */

describe("Multi-tenant isolation", () => {
  it("saveForCreator(A) never references creator_B in any deleteMany", async () => {
    const deleteCalls: { table: string; where: unknown }[] = [];
    const tx = createMockTx();
    for (const [table, methods] of Object.entries(tx)) {
      const dm = methods.deleteMany;
      if (dm) {
        dm.mockImplementation(async (args?: { where?: unknown }) => {
          deleteCalls.push({ table, where: args?.where });
          return {};
        });
      }
    }

    const prisma = {
      $transaction: vi.fn(async (fn: (tx: unknown) => Promise<void>, _opts?: unknown) => fn(tx))
    };
    const store = new DbCanonicalStore(prisma as never);
    const snap = creatorSnapshot("creator_A", "campaign_A");

    await store.saveForCreator("creator_A", snap);

    for (const call of deleteCalls) {
      const raw = JSON.stringify(call.where);
      expect(raw).not.toContain("creator_B");
    }
  });
});

/* ------------------------------------------------------------------ */
/*  Test: loadForCreator scoping                                       */
/* ------------------------------------------------------------------ */

describe("DbCanonicalStore.loadForCreator", () => {
  it("passes creatorId filter to all Prisma findMany calls", async () => {
    const findManyCalls: { model: string; args: unknown }[] = [];
    const mockFindMany = (model: string) =>
      vi.fn().mockImplementation(async (args?: unknown) => {
        findManyCalls.push({ model, args });
        return [];
      });

    const prisma = {
      campaign: { findMany: mockFindMany("campaign") },
      tier: { findMany: mockFindMany("tier") },
      post: { findMany: mockFindMany("post") },
      postVersion: { findMany: mockFindMany("postVersion") },
      mediaAsset: { findMany: mockFindMany("mediaAsset") },
      ingestIdempotencyKey: { findMany: mockFindMany("ingestIdempotencyKey") }
    };
    const store = new DbCanonicalStore(prisma as never);
    await store.loadForCreator("creator_X");

    const campaignCall = findManyCalls.find((c) => c.model === "campaign");
    expect((campaignCall!.args as { where: { creatorId: string } }).where.creatorId).toBe("creator_X");

    const postCall = findManyCalls.find((c) => c.model === "post");
    expect((postCall!.args as { where: { creatorId: string } }).where.creatorId).toBe("creator_X");

    const mediaCall = findManyCalls.find((c) => c.model === "mediaAsset");
    expect((mediaCall!.args as { where: { creatorId: string } }).where.creatorId).toBe("creator_X");

    const idemCall = findManyCalls.find((c) => c.model === "ingestIdempotencyKey");
    expect((idemCall!.args as { where: { creatorId: string } }).where.creatorId).toBe("creator_X");
  });

  it("global load() does NOT pass creatorId filter", async () => {
    const findManyCalls: { model: string; args: unknown }[] = [];
    const mockFindMany = (model: string) =>
      vi.fn().mockImplementation(async (args?: unknown) => {
        findManyCalls.push({ model, args });
        return [];
      });

    const prisma = {
      campaign: { findMany: mockFindMany("campaign") },
      tier: { findMany: mockFindMany("tier") },
      post: { findMany: mockFindMany("post") },
      postVersion: { findMany: mockFindMany("postVersion") },
      mediaAsset: { findMany: mockFindMany("mediaAsset") },
      ingestIdempotencyKey: { findMany: mockFindMany("ingestIdempotencyKey") }
    };
    const store = new DbCanonicalStore(prisma as never);
    await store.load();

    const campaignCall = findManyCalls.find((c) => c.model === "campaign");
    expect((campaignCall!.args as { where?: unknown })?.where).toBeUndefined();

    const postCall = findManyCalls.find((c) => c.model === "post");
    expect((postCall!.args as { where?: unknown })?.where).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ */
/*  Test: mutateForCreator end-to-end                                  */
/* ------------------------------------------------------------------ */

describe("DbCanonicalStore.mutateForCreator", () => {
  it("loads only the target creator and saves only that creator's data", async () => {
    const loadCalls: { model: string; args: unknown }[] = [];
    const saveCalls: { table: string; where: unknown }[] = [];

    const mockFindMany = (model: string) =>
      vi.fn().mockImplementation(async (args?: unknown) => {
        loadCalls.push({ model, args });
        return [];
      });

    const tx = createMockTx();
    for (const [table, methods] of Object.entries(tx)) {
      const dm = methods.deleteMany;
      if (dm) {
        dm.mockImplementation(async (args?: { where?: unknown }) => {
          saveCalls.push({ table, where: args?.where });
          return {};
        });
      }
    }

    const prisma = {
      campaign: { findMany: mockFindMany("campaign") },
      tier: { findMany: mockFindMany("tier") },
      post: { findMany: mockFindMany("post") },
      postVersion: { findMany: mockFindMany("postVersion") },
      mediaAsset: { findMany: mockFindMany("mediaAsset") },
      ingestIdempotencyKey: { findMany: mockFindMany("ingestIdempotencyKey") },
      $transaction: vi.fn(async (fn: (tx: unknown) => Promise<void>, _opts?: unknown) => fn(tx))
    };

    const store = new DbCanonicalStore(prisma as never);

    let mutatedSnapshot: CanonicalSnapshot | null = null;
    await store.mutateForCreator("creator_Z", (snapshot) => {
      mutatedSnapshot = snapshot;
    });

    expect(mutatedSnapshot).toBeDefined();

    const campaignLoad = loadCalls.find((c) => c.model === "campaign");
    expect((campaignLoad!.args as { where: { creatorId: string } }).where.creatorId).toBe("creator_Z");

    const campaignDelete = saveCalls.find((c) => c.table === "campaign");
    expect(campaignDelete).toBeDefined();
    expect(campaignDelete!.where).toEqual({ creatorId: "creator_Z" });
  });
});

/* ------------------------------------------------------------------ */
/*  Test: IngestService uses creator-scoped mutate                     */
/* ------------------------------------------------------------------ */

describe("IngestService.runBatch uses mutateForCreator", () => {
  it("calls mutateForCreator with the batch creator_id", async () => {
    const { IngestService } = await import("../src/ingest/ingest-service.js");

    const mutateForCreator = vi.fn().mockImplementation(
      async (_cid: string, fn: (s: CanonicalSnapshot) => void) => {
        fn({
          ingest_idempotency: {},
          campaigns: {},
          tiers: {},
          posts: {},
          media: {}
        });
      }
    );

    const store = {
      load: vi.fn(),
      save: vi.fn(),
      mutate: vi.fn(),
      loadForCreator: vi.fn(),
      saveForCreator: vi.fn(),
      mutateForCreator
    };

    const eventBus = { emit: vi.fn() };
    const svc = new IngestService(store as never, eventBus as never);

    await svc.runBatch(
      {
        creator_id: "creator_test",
        campaigns: [],
        tiers: [],
        posts: []
      },
      "trace_test"
    );

    expect(mutateForCreator).toHaveBeenCalledTimes(1);
    expect(mutateForCreator.mock.calls[0]![0]).toBe("creator_test");
    expect(store.mutate).not.toHaveBeenCalled();
  });
});

/* ------------------------------------------------------------------ */
/*  Test: Account → Tenant → CreatorProfile hierarchy contract         */
/* ------------------------------------------------------------------ */

describe("Account hierarchy contract", () => {
  it("provisionCreatorWorkspace returns a relay_creator_id with cr_ prefix", async () => {
    const { provisionCreatorWorkspace } = await import(
      "../src/creator/provision-creator-workspace.js"
    );

    const mockPrisma = {
      account: {
        findUnique: vi.fn()
          .mockResolvedValueOnce({
            id: "acc_1",
            primaryRelayCreatorId: null,
            emailNorm: "test@example.com"
          })
          .mockResolvedValueOnce({
            id: "acc_1",
            primaryRelayCreatorId: null,
            emailNorm: "test@example.com"
          }),
        update: vi.fn().mockResolvedValue({})
      },
      tenant: { create: vi.fn().mockResolvedValue({ id: "tenant_1" }) },
      user: { create: vi.fn().mockResolvedValue({ id: "user_1" }) },
      creatorProfile: {
        create: vi.fn().mockResolvedValue({}),
        findFirst: vi.fn().mockResolvedValue(null),
        findUnique: vi.fn().mockResolvedValue(null)
      },
      $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
        const txProxy = new Proxy(mockPrisma, {
          get: (target, prop) => (target as Record<string | symbol, unknown>)[prop]
        });
        return fn(txProxy);
      })
    };

    const result = await provisionCreatorWorkspace(mockPrisma as never, "acc_1");

    expect(result.relay_creator_id).toMatch(/^cr_[a-f0-9]{32}$/);
    expect(result.account_id).toBe("acc_1");
    expect(result.created).toBe(true);
    expect(mockPrisma.tenant.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          relayCreatorId: result.relay_creator_id
        })
      })
    );
  });

  it("provisionCreatorWorkspace is idempotent (returns existing workspace)", async () => {
    const { provisionCreatorWorkspace } = await import(
      "../src/creator/provision-creator-workspace.js"
    );

    const mockPrisma = {
      account: {
        findUnique: vi.fn().mockResolvedValue({
          id: "acc_2",
          primaryRelayCreatorId: "cr_existing123",
          emailNorm: "existing@example.com"
        })
      },
      creatorProfile: {
        findFirst: vi.fn().mockResolvedValue({ publicSlug: "existing-user" })
      }
    };

    const result = await provisionCreatorWorkspace(mockPrisma as never, "acc_2");

    expect(result.relay_creator_id).toBe("cr_existing123");
    expect(result.created).toBe(false);
    expect(result.public_slug).toBe("existing-user");
  });
});

/* ------------------------------------------------------------------ */
/*  Test: PK conflict resolution — orphan eviction from other creators */
/* ------------------------------------------------------------------ */

describe("PK conflict resolution (workspace migration)", () => {
  it("evicts orphan campaigns owned by another creator before inserting", async () => {
    const deleteCalls: { table: string; where: unknown }[] = [];
    const tx = createMockTx();

    // Pre-existing campaign under creator_old that conflicts with incoming
    tx.campaign.findMany = vi.fn().mockResolvedValue([
      { id: "patreon_campaign_123", creatorId: "creator_old" }
    ]);
    // No leftover posts under orphan campaign
    tx.post.findMany = vi.fn().mockResolvedValue([]);

    for (const [table, methods] of Object.entries(tx)) {
      const dm = methods.deleteMany;
      if (dm) {
        dm.mockImplementation(async (args?: { where?: unknown }) => {
          deleteCalls.push({ table, where: args?.where });
          return {};
        });
      }
    }

    const prisma = {
      $transaction: vi.fn(async (fn: (tx: unknown) => Promise<void>, _opts?: unknown) => fn(tx))
    };
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      const store = new DbCanonicalStore(prisma as never);
      const snap = creatorSnapshot("creator_new", "patreon_campaign_123");
      await store.saveForCreator("creator_new", snap);

      // Should have deleted the orphan campaign from creator_old
      const orphanCampaignDelete = deleteCalls.find(
        (c) =>
          c.table === "campaign" &&
          JSON.stringify(c.where).includes("patreon_campaign_123") &&
          !JSON.stringify(c.where).includes("creator_new")
      );
      expect(orphanCampaignDelete).toBeDefined();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("evicts orphan posts owned by another creator and logs a warning", async () => {
    const deleteCalls: { table: string; where: unknown }[] = [];
    const tx = createMockTx();

    // Campaign findMany returns no orphan campaigns
    tx.campaign.findMany = vi.fn().mockResolvedValue([]);

    // Post findMany: first call returns this creator's posts (phase 1),
    // second call finds orphan posts from another creator (phase 2)
    const postFindMany = vi.fn()
      .mockResolvedValueOnce([])  // phase 1: this creator's posts (empty)
      .mockResolvedValueOnce([    // phase 2: orphan posts from old creator
        { id: "patreon_post_999", creatorId: "creator_old" }
      ]);
    tx.post.findMany = postFindMany;

    for (const [table, methods] of Object.entries(tx)) {
      const dm = methods.deleteMany;
      if (dm) {
        dm.mockImplementation(async (args?: { where?: unknown }) => {
          deleteCalls.push({ table, where: args?.where });
          return {};
        });
      }
    }

    const prisma = {
      $transaction: vi.fn(async (fn: (tx: unknown) => Promise<void>, _opts?: unknown) => fn(tx))
    };
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      const store = new DbCanonicalStore(prisma as never);
      const snap: CanonicalSnapshot = {
        ingest_idempotency: {},
        campaigns: {
          creator_new: {
            camp_1: campaign("creator_new", "camp_1")
          }
        },
        tiers: {
          creator_new: {
            relay_tier_public: tier("creator_new", "relay_tier_public", "camp_1")
          }
        },
        posts: {
          creator_new: {
            patreon_post_999: post("creator_new", "patreon_post_999")
          }
        },
        media: {}
      };

      await store.saveForCreator("creator_new", snap);

      // Should log workspace migration warning
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("workspace migration")
      );
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("creator_old")
      );
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("creator_new")
      );

      // Orphan post's dependents should be cascade-deleted
      const postTierDelete = deleteCalls.find(
        (c) =>
          c.table === "postTier" &&
          JSON.stringify(c.where).includes("patreon_post_999")
      );
      expect(postTierDelete).toBeDefined();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("full workspace migration: same Patreon data, old → new creator_id", async () => {
    const inserted: { table: string; data: unknown }[] = [];
    const deleted: { table: string; where: unknown }[] = [];
    const tx = createMockTx();

    // Orphan campaign exists under old creator
    tx.campaign.findMany = vi.fn()
      .mockResolvedValueOnce([{ id: "camp_shared", creatorId: "old_creator" }]);

    // Orphan posts exist under old creator
    tx.post.findMany = vi.fn()
      .mockResolvedValueOnce([])  // phase 1: current creator's posts
      .mockResolvedValueOnce([    // phase 2: orphan posts
        { id: "post_shared_1", creatorId: "old_creator" },
        { id: "post_shared_2", creatorId: "old_creator" }
      ])
      .mockResolvedValueOnce([    // leftover posts under orphan campaign
        { id: "post_shared_1" },
        { id: "post_shared_2" }
      ]);

    for (const [table, methods] of Object.entries(tx)) {
      const dm = methods.deleteMany;
      if (dm) {
        dm.mockImplementation(async (args?: { where?: unknown }) => {
          deleted.push({ table, where: args?.where });
          return {};
        });
      }
      const cm = methods.createMany;
      if (cm) {
        cm.mockImplementation(async (args?: { data?: unknown }) => {
          inserted.push({ table, data: args?.data });
          return {};
        });
      }
    }
    tx.post.create = vi.fn().mockImplementation(async (args?: { data?: unknown }) => {
      inserted.push({ table: "post", data: args?.data });
      return {};
    });

    const prisma = {
      $transaction: vi.fn(async (fn: (tx: unknown) => Promise<void>, _opts?: unknown) => fn(tx))
    };
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      const store = new DbCanonicalStore(prisma as never);
      const snap: CanonicalSnapshot = {
        ingest_idempotency: {},
        campaigns: {
          new_creator: { camp_shared: campaign("new_creator", "camp_shared") }
        },
        tiers: {
          new_creator: { relay_tier_public: tier("new_creator", "relay_tier_public", "camp_shared") }
        },
        posts: {
          new_creator: {
            post_shared_1: post("new_creator", "post_shared_1"),
            post_shared_2: post("new_creator", "post_shared_2")
          }
        },
        media: {}
      };

      await store.saveForCreator("new_creator", snap);

      // Campaign should be inserted under new_creator
      const campaignInsert = inserted.find((i) => i.table === "campaign");
      expect(campaignInsert).toBeDefined();
      const campData = (campaignInsert!.data as { creatorId: string }[])[0]!;
      expect(campData.creatorId).toBe("new_creator");

      // Posts should be inserted under new_creator
      const postInserts = inserted.filter((i) => i.table === "post");
      expect(postInserts).toHaveLength(2);
      for (const pi of postInserts) {
        expect((pi.data as { creatorId: string }).creatorId).toBe("new_creator");
      }

      // No constraint errors (if we got here, the mocks accepted everything)
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("does nothing when there are no PK conflicts", async () => {
    const deleteCalls: { table: string; where: unknown }[] = [];
    const tx = createMockTx();

    // No orphans anywhere
    tx.campaign.findMany = vi.fn().mockResolvedValue([]);
    tx.post.findMany = vi.fn().mockResolvedValue([]);

    for (const [table, methods] of Object.entries(tx)) {
      const dm = methods.deleteMany;
      if (dm) {
        dm.mockImplementation(async (args?: { where?: unknown }) => {
          deleteCalls.push({ table, where: args?.where });
          return {};
        });
      }
    }

    const prisma = {
      $transaction: vi.fn(async (fn: (tx: unknown) => Promise<void>, _opts?: unknown) => fn(tx))
    };
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      const store = new DbCanonicalStore(prisma as never);
      const snap = creatorSnapshot("creator_clean", "campaign_clean");
      await store.saveForCreator("creator_clean", snap);

      // No migration warnings
      const migrationWarns = warnSpy.mock.calls.filter((c) =>
        String(c[0]).includes("workspace migration")
      );
      expect(migrationWarns).toHaveLength(0);
    } finally {
      warnSpy.mockRestore();
    }
  });
});
