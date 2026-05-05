import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/server.js";
import {
  isMediaEligibleForRelayNativePost,
  RelayCreatePostError,
  resolveCampaignIdForRelayPost
} from "../src/relay/create-relay-post.js";
import { MediaIngestOrigin } from "@prisma/client";

function baseConfig(temp: string) {
  return {
    patreon_client_id: "c",
    patreon_client_secret: "s",
    relay_token_encryption_key: randomBytes(32).toString("base64"),
    credential_store_path: join(temp, "patreon.json"),
    ingest_canonical_path: join(temp, "canonical.json"),
    ingest_dlq_path: join(temp, "dlq.json"),
    export_storage_root: join(temp, "exports"),
    gallery_post_overrides_path: join(temp, "overrides.json"),
    gallery_saved_filters_path: join(temp, "sf.json"),
    analytics_store_path: join(temp, "a.json"),
    clone_store_path: join(temp, "cl.json"),
    identity_store_path: join(temp, "id.json"),
    payment_store_path: join(temp, "p.json"),
    migration_store_path: join(temp, "m.json"),
    deploy_store_path: join(temp, "d.json"),
    fetch_impl: vi.fn(() => new Response("{}", { status: 200 })) as unknown as typeof fetch
  };
}

function prismaStub(over: Record<string, unknown>) {
  return over as any;
}

describe("resolveCampaignIdForRelayPost", () => {
  it("uses explicit campaign_id when valid for creator", async () => {
    const prisma = prismaStub({
      campaign: {
        findFirst: vi.fn().mockImplementation(({ where: w }: { where: { id: string } }) =>
          w.id === "c1" ? { id: "c1", creatorId: "cr" } : null
        )
      }
    });
    const id = await resolveCampaignIdForRelayPost(prisma, "cr", "c1");
    expect(id).toBe("c1");
  });

  it("throws INVALID_CAMPAIGN when explicit id is missing", async () => {
    const prisma = prismaStub({
      campaign: { findFirst: vi.fn().mockResolvedValue(null) }
    });
    await expect(
      resolveCampaignIdForRelayPost(prisma, "cr", "nope")
    ).rejects.toMatchObject({ code: "INVALID_CAMPAIGN" });
  });

  it("uses CreatorProfile.patreonCampaignId when present", async () => {
    const prisma = prismaStub({
      creatorProfile: {
        findFirst: vi.fn().mockResolvedValue({ patreonCampaignId: "patreon_c1" })
      },
      campaign: {
        findFirst: vi.fn().mockImplementation(({ where: w }: { where: { id: string; creatorId: string } }) => {
          if (w.id === "patreon_c1" && w.creatorId === "cr") {
            return { id: "patreon_c1" };
          }
          return null;
        }),
        findMany: vi.fn()
      }
    });
    const id = await resolveCampaignIdForRelayPost(prisma, "cr", null);
    expect(id).toBe("patreon_c1");
  });

  it("uses sole campaign for creator when profile has no patreon id", async () => {
    const prisma = prismaStub({
      creatorProfile: { findFirst: vi.fn().mockResolvedValue({ patreonCampaignId: null }) },
      campaign: {
        findFirst: vi.fn(),
        findMany: vi.fn().mockResolvedValue([{ id: "only_one" }])
      }
    });
    const id = await resolveCampaignIdForRelayPost(prisma, "cr", null);
    expect(id).toBe("only_one");
  });

  it("throws CAMPAIGN_AMBIGUOUS when multiple campaigns and no id", async () => {
    const prisma = prismaStub({
      creatorProfile: { findFirst: vi.fn().mockResolvedValue({ patreonCampaignId: null }) },
      campaign: {
        findFirst: vi.fn(),
        findMany: vi
          .fn()
          .mockResolvedValue([{ id: "a" }, { id: "b" }])
      }
    });
    await expect(resolveCampaignIdForRelayPost(prisma, "cr", null)).rejects.toMatchObject({
      code: "CAMPAIGN_AMBIGUOUS"
    });
  });
});

describe("isMediaEligibleForRelayNativePost", () => {
  it("allows RELAY_UPLOAD with storage key", () => {
    expect(
      isMediaEligibleForRelayNativePost({
        ingestOrigin: MediaIngestOrigin.RELAY_UPLOAD,
        currentStorageKey: "relay/tenants/x/media/m/a"
      })
    ).toBe(true);
  });

  it("allows DISCORD with storage key", () => {
    expect(
      isMediaEligibleForRelayNativePost({
        ingestOrigin: MediaIngestOrigin.DISCORD,
        currentStorageKey: "relay/tenants/x/media/m/a"
      })
    ).toBe(true);
  });

  it("rejects PATREON and missing key", () => {
    expect(
      isMediaEligibleForRelayNativePost({
        ingestOrigin: MediaIngestOrigin.PATREON,
        currentStorageKey: "relay/tenants/x/media/m/a"
      })
    ).toBe(false);
    expect(
      isMediaEligibleForRelayNativePost({
        ingestOrigin: MediaIngestOrigin.RELAY_UPLOAD,
        currentStorageKey: null
      })
    ).toBe(false);
    expect(
      isMediaEligibleForRelayNativePost({
        ingestOrigin: MediaIngestOrigin.DISCORD,
        currentStorageKey: "  "
      })
    ).toBe(false);
  });
});

describe("RelayCreatePostError", () => {
  it("exposes code and statusCode", () => {
    const e = new RelayCreatePostError("INVALID_TIER_REF", "bad", 400);
    expect(e.code).toBe("INVALID_TIER_REF");
    expect(e.statusCode).toBe(400);
  });
});

describe("POST /api/v1/relay/posts", () => {
  it("503 when no prisma", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-posts-"));
    try {
      const { app } = createApp(baseConfig(tempDir));
      const res = await request(app).post("/api/v1/relay/posts").send({
        creator_id: "x",
        title: "t",
        is_public: true,
        tier_ids: [],
        tag_ids: [],
        media_ids: [],
        publish: true
      });
      expect(res.status).toBe(503);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
