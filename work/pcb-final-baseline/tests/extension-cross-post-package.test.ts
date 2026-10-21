/**
 * Cross-post package helper + GET /api/v1/extension/cross-post/patreon/:post_id route tests.
 */
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import {
  MediaUpstreamStatus,
  PostSource,
  PostUpstreamStatus
} from "@prisma/client";
import { createApp } from "../src/server.js";
import {
  buildPatreonCrossPostPackage,
  crossPostMediaContentUrlPath
} from "../src/extension/cross-post-package.js";
import { IdentityService } from "../src/identity/identity-service.js";
import { FileIdentityStore } from "../src/identity/identity-store.js";
import type { UserAccount } from "../src/identity/types.js";

const CREATOR_OWNER = "cr_crosspost_owner";
const CREATOR_OTHER = "cr_crosspost_other";
const ACCOUNT_OWNER = "acc_crosspost_owner";
const ACCOUNT_OTHER = "acc_crosspost_other";
const MEMBERSHIP_OWNER = "tm_crosspost_owner";
const MEMBERSHIP_OTHER = "tm_crosspost_other";
const POST_ID = "relay_post_crosspost_1";

type TestPost = {
  id: string;
  creatorId: string;
  source: PostSource;
  upstreamStatus: PostUpstreamStatus;
  versions: Array<{
    versionSeq: number;
    title: string;
    description: string | null;
    mediaIds: string[];
  }>;
  presentation: {
    relayTitle: string | null;
    relayDescription: string | null;
    mediaOrder: string[];
  } | null;
};

type TestMedia = {
  id: string;
  creatorId: string;
  currentMimeType: string | null;
  upstreamStatus: MediaUpstreamStatus;
};

type CrossPostStubState = {
  accounts: Array<{ id: string; primaryRelayCreatorId: string | null }>;
  memberships: Array<{ id: string; accountId: string }>;
  posts: TestPost[];
  media: TestMedia[];
};

function prismaStub(state: CrossPostStubState): PrismaClient {
  const accountsById = new Map(state.accounts.map((a) => [a.id, a]));
  const membershipsById = new Map(state.memberships.map((m) => [m.id, m]));
  const postsById = new Map(state.posts.map((p) => [p.id, p]));
  const mediaById = new Map(state.media.map((m) => [m.id, m]));

  return {
    account: {
      findUnique: vi.fn(async (args: { where: { id: string }; select?: { primaryRelayCreatorId?: boolean } }) => {
        const row = accountsById.get(args.where.id);
        if (!row) return null;
        if (args.select?.primaryRelayCreatorId) {
          return { primaryRelayCreatorId: row.primaryRelayCreatorId };
        }
        return row;
      })
    },
    tenantMembership: {
      findUnique: vi.fn(async (args: { where: { id: string }; select?: { accountId?: boolean } }) => {
        const row = membershipsById.get(args.where.id);
        if (!row) return null;
        if (args.select?.accountId) {
          return { accountId: row.accountId };
        }
        return row;
      })
    },
    post: {
      findFirst: vi.fn(
        async (args: {
          where: {
            id: string;
            source: PostSource;
            upstreamStatus: PostUpstreamStatus;
          };
          include: {
            versions: { orderBy: { versionSeq: "desc" }; take: number };
            presentation: { select: Record<string, boolean> };
          };
        }) => {
          const post = postsById.get(args.where.id);
          if (!post) return null;
          if (post.source !== args.where.source || post.upstreamStatus !== args.where.upstreamStatus) {
            return null;
          }
          const versions = [...post.versions].sort((a, b) => b.versionSeq - a.versionSeq);
          return {
            ...post,
            versions: versions.slice(0, args.include.versions.take),
            presentation: post.presentation
          };
        }
      )
    },
    mediaAsset: {
      findMany: vi.fn(
        async (args: {
          where: {
            id: { in: string[] };
            creatorId: string;
            upstreamStatus: MediaUpstreamStatus;
          };
        }) => {
          return args.where.id.in
            .map((id) => mediaById.get(id))
            .filter((row): row is TestMedia => {
              if (!row) return false;
              return (
                row.creatorId === args.where.creatorId &&
                row.upstreamStatus === args.where.upstreamStatus
              );
            })
            .map((row) => ({
              id: row.id,
              currentMimeType: row.currentMimeType
            }));
        }
      )
    }
  } as unknown as PrismaClient;
}

function baseAppConfig(tempDir: string, prisma: PrismaClient) {
  return {
    patreon_client_id: "c",
    patreon_client_secret: "s",
    relay_token_encryption_key: randomBytes(32).toString("base64"),
    credential_store_path: join(tempDir, "patreon.json"),
    ingest_canonical_path: join(tempDir, "canonical.json"),
    ingest_dlq_path: join(tempDir, "dlq.json"),
    export_storage_root: join(tempDir, "exports"),
    gallery_post_overrides_path: join(tempDir, "gallery_overrides.json"),
    gallery_saved_filters_path: join(tempDir, "saved_filters.json"),
    collections_store_path: join(tempDir, "collections.json"),
    page_layout_store_path: join(tempDir, "page_layout.json"),
    patron_favorites_store_path: join(tempDir, "patron_favorites.json"),
    analytics_store_path: join(tempDir, "analytics.json"),
    clone_store_path: join(tempDir, "clone_sites.json"),
    identity_store_path: join(tempDir, "identity.json"),
    payment_store_path: join(tempDir, "payments.json"),
    migration_store_path: join(tempDir, "migrations.json"),
    deploy_store_path: join(tempDir, "deploys.json"),
    fetch_impl: vi.fn(async () => new Response("{}", { status: 200 })) as unknown as typeof fetch,
    prisma,
    relay_db_store_identity: false
  };
}

function ownerUser(membershipId = MEMBERSHIP_OWNER): UserAccount {
  const now = new Date().toISOString();
  return {
    user_id: membershipId,
    creator_id: CREATOR_OWNER,
    email: "crosspost-owner@test.example",
    password_hash: "x",
    auth_provider: "independent",
    tier_ids: [],
    created_at: now,
    updated_at: now
  };
}

async function seedExtensionToken(
  tempDir: string,
  user: UserAccount = ownerUser()
): Promise<string> {
  const store = new FileIdentityStore(join(tempDir, "identity.json"));
  const svc = new IdentityService(store);
  await store.createUser(user);
  const session = await svc.issueExtensionSession(user, "cross-post-test");
  return session.token;
}

async function seedWebToken(tempDir: string, user: UserAccount = ownerUser()): Promise<string> {
  const store = new FileIdentityStore(join(tempDir, "identity.json"));
  const svc = new IdentityService(store);
  await store.createUser(user);
  const session = await svc.issueSessionForUser(user);
  return session.token;
}

function defaultStubState(overrides?: Partial<CrossPostStubState>): CrossPostStubState {
  return {
    accounts: [
      { id: ACCOUNT_OWNER, primaryRelayCreatorId: CREATOR_OWNER },
      { id: ACCOUNT_OTHER, primaryRelayCreatorId: CREATOR_OTHER }
    ],
    memberships: [
      { id: MEMBERSHIP_OWNER, accountId: ACCOUNT_OWNER },
      { id: MEMBERSHIP_OTHER, accountId: ACCOUNT_OTHER }
    ],
    posts: [
      {
        id: POST_ID,
        creatorId: CREATOR_OWNER,
        source: PostSource.RELAY,
        upstreamStatus: PostUpstreamStatus.active,
        versions: [
          {
            versionSeq: 1,
            title: "Relay title",
            description: "<p>Hello <strong>world</strong></p>",
            mediaIds: ["media_video", "media_image"]
          }
        ],
        presentation: null
      }
    ],
    media: [
      {
        id: "media_video",
        creatorId: CREATOR_OWNER,
        currentMimeType: "video/mp4",
        upstreamStatus: MediaUpstreamStatus.active
      },
      {
        id: "media_image",
        creatorId: CREATOR_OWNER,
        currentMimeType: "image/png",
        upstreamStatus: MediaUpstreamStatus.active
      }
    ],
    ...overrides
  };
}

describe("buildPatreonCrossPostPackage", () => {
  it("returns ok package for owner with image before non-image media", async () => {
    const prisma = prismaStub(defaultStubState());
    const result = await buildPatreonCrossPostPackage(prisma, {
      postId: POST_ID,
      accountId: ACCOUNT_OWNER
    });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.package.relay_post_id).toBe(POST_ID);
    expect(result.package.title).toBe("Relay title");
    expect(result.package.body_text).toBe("Hello world");
    expect(result.package.body_html).toContain("<p>");
    expect(result.package.media).toHaveLength(2);
    expect(result.package.media[0]!.media_id).toBe("media_image");
    expect(result.package.media[0]!.mime_type).toBe("image/png");
    expect(result.package.media[1]!.media_id).toBe("media_video");
    expect(result.package.media[1]!.mime_type).toBe("video/mp4");
    expect(result.package.media[0]!.content_url).toBe(
      crossPostMediaContentUrlPath(CREATOR_OWNER, "media_image")
    );
    expect(result.package.media[0]!.content_url).not.toContain("patreon.com");
  });

  it("returns no_primary_creator when account has no studio", async () => {
    const prisma = prismaStub(
      defaultStubState({
        accounts: [{ id: ACCOUNT_OWNER, primaryRelayCreatorId: null }]
      })
    );
    const result = await buildPatreonCrossPostPackage(prisma, {
      postId: POST_ID,
      accountId: ACCOUNT_OWNER
    });
    expect(result).toEqual({ status: "no_primary_creator" });
  });

  it("returns not_found for missing post", async () => {
    const prisma = prismaStub(defaultStubState({ posts: [] }));
    const result = await buildPatreonCrossPostPackage(prisma, {
      postId: "missing_post",
      accountId: ACCOUNT_OWNER
    });
    expect(result).toEqual({ status: "not_found" });
  });

  it("returns forbidden when post belongs to another creator", async () => {
    const prisma = prismaStub(defaultStubState());
    const result = await buildPatreonCrossPostPackage(prisma, {
      postId: POST_ID,
      accountId: ACCOUNT_OTHER
    });
    expect(result).toEqual({ status: "forbidden" });
  });

  it("returns ok with empty media when version has no attachments", async () => {
    const prisma = prismaStub(
      defaultStubState({
        posts: [
          {
            id: POST_ID,
            creatorId: CREATOR_OWNER,
            source: PostSource.RELAY,
            upstreamStatus: PostUpstreamStatus.active,
            versions: [
              {
                versionSeq: 1,
                title: "Text only",
                description: "Plain body",
                mediaIds: []
              }
            ],
            presentation: null
          }
        ],
        media: []
      })
    );
    const result = await buildPatreonCrossPostPackage(prisma, {
      postId: POST_ID,
      accountId: ACCOUNT_OWNER
    });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.package.media).toEqual([]);
    expect(result.package.body_text).toBe("Plain body");
  });

  it("includes non-image media with mime_type for extension skip/report", async () => {
    const prisma = prismaStub(
      defaultStubState({
        posts: [
          {
            id: POST_ID,
            creatorId: CREATOR_OWNER,
            source: PostSource.RELAY,
            upstreamStatus: PostUpstreamStatus.active,
            versions: [
              {
                versionSeq: 1,
                title: "Audio post",
                description: null,
                mediaIds: ["media_audio"]
              }
            ],
            presentation: null
          }
        ],
        media: [
          {
            id: "media_audio",
            creatorId: CREATOR_OWNER,
            currentMimeType: "audio/mpeg",
            upstreamStatus: MediaUpstreamStatus.active
          }
        ]
      })
    );
    const result = await buildPatreonCrossPostPackage(prisma, {
      postId: POST_ID,
      accountId: ACCOUNT_OWNER
    });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.package.media).toEqual([
      expect.objectContaining({
        media_id: "media_audio",
        mime_type: "audio/mpeg",
        content_url: crossPostMediaContentUrlPath(CREATOR_OWNER, "media_audio")
      })
    ]);
  });
});

describe("GET /api/v1/extension/cross-post/patreon/:post_id", () => {
  it("returns 401 without bearer", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-xpost-401-"));
    const prisma = prismaStub(defaultStubState());
    const { app } = createApp(baseAppConfig(tempDir, prisma));
    const res = await request(app).get(`/api/v1/extension/cross-post/patreon/${POST_ID}`);
    expect(res.status).toBe(401);
  });

  it("returns 403 for web session (extension grant required)", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-xpost-web-"));
    const prisma = prismaStub(defaultStubState());
    const webToken = await seedWebToken(tempDir);
    const { app } = createApp(baseAppConfig(tempDir, prisma));
    const res = await request(app)
      .get(`/api/v1/extension/cross-post/patreon/${POST_ID}`)
      .set("Authorization", `Bearer ${webToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error?.message).toMatch(/extension grant/i);
  });

  it("returns 200 with package for owner extension grant", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-xpost-200-"));
    const prisma = prismaStub(defaultStubState());
    const extToken = await seedExtensionToken(tempDir);
    const { app } = createApp(baseAppConfig(tempDir, prisma));
    const res = await request(app)
      .get(`/api/v1/extension/cross-post/patreon/${POST_ID}`)
      .set("Authorization", `Bearer ${extToken}`)
      .set("Accept", "application/json");
    expect(res.status).toBe(200);
    expect(res.body.data.relay_post_id).toBe(POST_ID);
    expect(res.body.data.title).toBe("Relay title");
    expect(res.body.data.media[0].media_id).toBe("media_image");
  });

  it("returns 404 for missing post", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-xpost-404-"));
    const prisma = prismaStub(defaultStubState({ posts: [] }));
    const extToken = await seedExtensionToken(tempDir);
    const { app } = createApp(baseAppConfig(tempDir, prisma));
    const res = await request(app)
      .get(`/api/v1/extension/cross-post/patreon/${POST_ID}`)
      .set("Authorization", `Bearer ${extToken}`);
    expect(res.status).toBe(404);
  });

  it("returns 403 when extension grant account does not own the post", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-xpost-403-"));
    const prisma = prismaStub(defaultStubState());
    const extToken = await seedExtensionToken(
      tempDir,
      ownerUser(MEMBERSHIP_OTHER)
    );
    const { app } = createApp(baseAppConfig(tempDir, prisma));
    const res = await request(app)
      .get(`/api/v1/extension/cross-post/patreon/${POST_ID}`)
      .set("Authorization", `Bearer ${extToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error?.message).toMatch(/not owned/i);
  });
});
