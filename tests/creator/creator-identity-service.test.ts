import { describe, expect, it, vi } from "vitest";
import { PublicSlugSource } from "@prisma/client";
import {
  getCreatorIdentity,
  normalizeCreatorUsername,
  patchCreatorIdentity,
  promoteSnapshotToProfile,
  validateCreatorUsernameFormat
} from "../../src/creator/creator-identity-service.js";

function makeProfile(overrides: Record<string, unknown> = {}) {
  return {
    id: "prof_1",
    tenantId: "t1",
    userId: "u1",
    publicSlug: "test-creator",
    slugSource: PublicSlugSource.user_chosen,
    patreonCampaignId: null,
    username: null,
    usernameNorm: null,
    displayName: null,
    avatarUrl: null,
    bannerUrl: null,
    bio: null,
    discipline: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  };
}

function makePrisma(opts: {
  primaryRelayCreatorId?: string | null;
  profile?: ReturnType<typeof makeProfile> | null;
  clashOnUsername?: boolean;
  tenant?: { id: string } | null;
  /** When set, `publicSlug` lookup returns another profile id (collision). */
  slugHeldByOther?: string;
} = {}) {
  const profile = opts.profile !== undefined ? opts.profile : makeProfile();
  const relayId = "primaryRelayCreatorId" in opts ? opts.primaryRelayCreatorId : "cr_123";
  const tenantVal = "tenant" in opts ? opts.tenant : { id: "t1" };

  return {
    account: {
      findUnique: vi.fn(async () => ({
        primaryRelayCreatorId: relayId
      }))
    },
    tenant: {
      findUnique: vi.fn(async () => tenantVal)
    },
    creatorProfile: {
      findFirst: vi.fn(async ({ where }: { where?: Record<string, unknown> }) => {
        if (where && "usernameNorm" in where && opts.clashOnUsername) {
          return { id: "other_prof" };
        }
        if (where && "usernameNorm" in where) {
          return null;
        }
        if (where && "publicSlug" in where && typeof (where as { publicSlug?: string }).publicSlug === "string") {
          const wanted = (where as { publicSlug: string }).publicSlug;
          if (profile && wanted === profile.publicSlug) {
            return { id: profile.id };
          }
          if (opts.slugHeldByOther && wanted === opts.slugHeldByOther) {
            return { id: "other_prof" };
          }
          return null;
        }
        return profile;
      }),
      update: vi.fn(async (_args: Record<string, unknown>) => {
        const data = (_args as { data: Record<string, unknown> }).data;
        return { ...(profile ?? {}), ...data };
      })
    }
  } as unknown;
}

describe("normalizeCreatorUsername", () => {
  it("lowercases and strips non-alphanumeric/underscore", () => {
    expect(normalizeCreatorUsername("Hello_World123")).toBe("hello_world123");
    expect(normalizeCreatorUsername("  MixedCase!  ")).toBe("mixedcase");
    expect(normalizeCreatorUsername("a-b-c")).toBe("abc");
  });
});

describe("validateCreatorUsernameFormat", () => {
  it("rejects too short", () => {
    const r = validateCreatorUsernameFormat("ab");
    expect(r.ok).toBe(false);
  });

  it("accepts valid username", () => {
    expect(validateCreatorUsernameFormat("cool_artist_42").ok).toBe(true);
  });

  it("rejects reserved names", () => {
    const r = validateCreatorUsernameFormat("admin");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/reserved/i);
  });

  it("rejects hyphens (only underscores allowed)", () => {
    const r = validateCreatorUsernameFormat("my-name");
    expect(r.ok).toBe(false);
  });
});

describe("getCreatorIdentity", () => {
  it("returns null when account has no relay creator id", async () => {
    const prisma = makePrisma({ primaryRelayCreatorId: null });
    const result = await getCreatorIdentity(prisma as never, "acc_1");
    expect(result).toBeNull();
  });

  it("returns profile view with needs_setup when displayName missing", async () => {
    const prisma = makePrisma({ profile: makeProfile({ displayName: null, avatarUrl: null }) });
    const result = await getCreatorIdentity(prisma as never, "acc_1");
    expect(result).not.toBeNull();
    expect(result!.needs_setup).toBe(true);
    expect(result!.public_slug).toBe("test-creator");
    expect(result!.slug_source).toBe(PublicSlugSource.user_chosen);
  });

  it("returns needs_setup false when displayName + avatarUrl set", async () => {
    const prisma = makePrisma({
      profile: makeProfile({ displayName: "My Studio", avatarUrl: "https://example.com/avatar.jpg" })
    });
    const result = await getCreatorIdentity(prisma as never, "acc_1");
    expect(result!.needs_setup).toBe(false);
  });
});

describe("patchCreatorIdentity", () => {
  it("returns NOT_FOUND when no profile", async () => {
    const prisma = makePrisma({ primaryRelayCreatorId: null });
    const result = await patchCreatorIdentity(prisma as never, "acc_1", { display_name: "X" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("NOT_FOUND");
  });

  it("validates bio length cap (280)", async () => {
    const prisma = makePrisma();
    const result = await patchCreatorIdentity(prisma as never, "acc_1", {
      bio: "x".repeat(281)
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("VALIDATION_ERROR");
      expect(result.message).toMatch(/280/);
    }
  });

  it("validates display_name length cap (120)", async () => {
    const prisma = makePrisma();
    const result = await patchCreatorIdentity(prisma as never, "acc_1", {
      display_name: "x".repeat(121)
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("VALIDATION_ERROR");
  });

  it("validates discipline length cap (120)", async () => {
    const prisma = makePrisma();
    const result = await patchCreatorIdentity(prisma as never, "acc_1", {
      discipline: "x".repeat(121)
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("VALIDATION_ERROR");
  });

  it("validates avatar_url length cap (2048)", async () => {
    const prisma = makePrisma();
    const result = await patchCreatorIdentity(prisma as never, "acc_1", {
      avatar_url: "https://example.com/" + "x".repeat(2040)
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("VALIDATION_ERROR");
  });

  it("rejects invalid username format", async () => {
    const prisma = makePrisma();
    const result = await patchCreatorIdentity(prisma as never, "acc_1", {
      username: "ab"
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("VALIDATION_ERROR");
  });

  it("rejects reserved username", async () => {
    const prisma = makePrisma();
    const result = await patchCreatorIdentity(prisma as never, "acc_1", {
      username: "admin"
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/reserved/i);
  });

  it("returns CONFLICT when username taken", async () => {
    const prisma = makePrisma({ clashOnUsername: true });
    const result = await patchCreatorIdentity(prisma as never, "acc_1", {
      username: "taken_name"
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("CONFLICT");
  });

  it("allows clearing username to null", async () => {
    const prisma = makePrisma({
      profile: makeProfile({ username: "old_name", usernameNorm: "old_name" })
    });
    const result = await patchCreatorIdentity(prisma as never, "acc_1", {
      username: null
    });
    expect(result.ok).toBe(true);
  });

  it("succeeds with valid fields", async () => {
    const prisma = makePrisma();
    const result = await patchCreatorIdentity(prisma as never, "acc_1", {
      display_name: "My Studio",
      bio: "Digital illustrator",
      discipline: "Illustration"
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.profile.display_name).toBe("My Studio");
    }
  });

  it("no-ops when no fields provided", async () => {
    const prisma = makePrisma();
    const result = await patchCreatorIdentity(prisma as never, "acc_1", {});
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.profile.public_slug).toBe("test-creator");
    }
  });
});

describe("promoteSnapshotToProfile", () => {
  function makeSnapshotStore(snapshot: Record<string, unknown> | null) {
    return { get: vi.fn(async () => snapshot) } as unknown;
  }

  it("does nothing when no tenant found", async () => {
    const prisma = makePrisma({ tenant: null });
    const store = makeSnapshotStore({ patreon_name: "cool_artist" });
    const result = await promoteSnapshotToProfile(prisma as never, store as never, "cr_123");
    expect(result.promoted).toBe(false);
  });

  it("does nothing when no snapshot exists", async () => {
    const prisma = makePrisma();
    const store = makeSnapshotStore(null);
    const result = await promoteSnapshotToProfile(prisma as never, store as never, "cr_123");
    expect(result.promoted).toBe(false);
  });

  it("fills displayName and avatarUrl from snapshot when null", async () => {
    const prisma = makePrisma({
      profile: makeProfile({ displayName: null, avatarUrl: null, bannerUrl: null, username: null })
    });
    const store = makeSnapshotStore({
      patreon_campaign_id: "camp_1",
      patreon_name: "coolartist",
      image_small_url: "https://cdn/small.jpg",
      image_url: "https://cdn/large.jpg",
      captured_at: new Date().toISOString()
    });
    const result = await promoteSnapshotToProfile(prisma as never, store as never, "cr_123");
    expect(result.promoted).toBe(true);
    const updateCall = (prisma as { creatorProfile: { update: ReturnType<typeof vi.fn> } }).creatorProfile.update;
    expect(updateCall).toHaveBeenCalledOnce();
    const data = updateCall.mock.calls[0][0].data;
    expect(data.displayName).toBe("coolartist");
    expect(data.avatarUrl).toBe("https://cdn/small.jpg");
    expect(data.bannerUrl).toBe("https://cdn/large.jpg");
  });

  it("does not overwrite existing creator-authored fields", async () => {
    const prisma = makePrisma({
      profile: makeProfile({
        displayName: "My Custom Name",
        avatarUrl: "https://my.own/avatar.jpg",
        bannerUrl: null,
        username: "my_handle"
      })
    });
    const store = makeSnapshotStore({
      patreon_campaign_id: "camp_1",
      patreon_name: "patreonvanity",
      image_small_url: "https://cdn/small.jpg",
      image_url: "https://cdn/large.jpg",
      captured_at: new Date().toISOString()
    });
    const result = await promoteSnapshotToProfile(prisma as never, store as never, "cr_123");
    expect(result.promoted).toBe(true);
    const updateCall = (prisma as { creatorProfile: { update: ReturnType<typeof vi.fn> } }).creatorProfile.update;
    const data = updateCall.mock.calls[0][0].data;
    expect(data.displayName).toBeUndefined();
    expect(data.avatarUrl).toBeUndefined();
    expect(data.username).toBeUndefined();
    expect(data.bannerUrl).toBe("https://cdn/large.jpg");
    expect(data.publicSlug).toBeUndefined();
    expect(data.slugSource).toBeUndefined();
  });

  it("sets public slug from patreon vanity when slugSource is allocated", async () => {
    const prisma = makePrisma({
      profile: makeProfile({
        publicSlug: "studio",
        slugSource: PublicSlugSource.allocated,
        displayName: null,
        avatarUrl: null,
        bannerUrl: null,
        username: null
      })
    });
    const store = makeSnapshotStore({
      patreon_campaign_id: "camp_1",
      patreon_name: "coolartist",
      image_small_url: "https://cdn/small.jpg",
      captured_at: new Date().toISOString()
    });
    const result = await promoteSnapshotToProfile(prisma as never, store as never, "cr_123");
    expect(result.promoted).toBe(true);
    const updateCall = (prisma as { creatorProfile: { update: ReturnType<typeof vi.fn> } }).creatorProfile.update;
    const data = updateCall.mock.calls[0][0].data;
    expect(data.publicSlug).toBe("coolartist");
    expect(data.slugSource).toBe(PublicSlugSource.patreon_default);
  });

  it("does not change public slug when slugSource is user_chosen", async () => {
    const prisma = makePrisma({
      profile: makeProfile({
        publicSlug: "my-pick",
        slugSource: PublicSlugSource.user_chosen,
        displayName: null,
        avatarUrl: null,
        bannerUrl: null,
        username: null
      })
    });
    const store = makeSnapshotStore({
      patreon_campaign_id: "camp_1",
      patreon_name: "patreonvanity",
      image_small_url: "https://cdn/small.jpg",
      captured_at: new Date().toISOString()
    });
    const result = await promoteSnapshotToProfile(prisma as never, store as never, "cr_123");
    expect(result.promoted).toBe(true);
    const updateCall = (prisma as { creatorProfile: { update: ReturnType<typeof vi.fn> } }).creatorProfile.update;
    const data = updateCall.mock.calls[0][0].data;
    expect(data.publicSlug).toBeUndefined();
    expect(data.slugSource).toBeUndefined();
  });

  it("appends suffix when patreon vanity slug is taken by another profile", async () => {
    const prisma = makePrisma({
      slugHeldByOther: "coolartist",
      profile: makeProfile({
        publicSlug: "studio",
        slugSource: PublicSlugSource.allocated,
        displayName: null,
        avatarUrl: null,
        bannerUrl: null,
        username: null
      })
    });
    const store = makeSnapshotStore({
      patreon_campaign_id: "camp_1",
      patreon_name: "coolartist",
      image_small_url: "https://cdn/small.jpg",
      captured_at: new Date().toISOString()
    });
    const result = await promoteSnapshotToProfile(prisma as never, store as never, "cr_123");
    expect(result.promoted).toBe(true);
    const updateCall = (prisma as { creatorProfile: { update: ReturnType<typeof vi.fn> } }).creatorProfile.update;
    const data = updateCall.mock.calls[0][0].data;
    expect(data.publicSlug).toMatch(/^coolartist-[a-f0-9]{4}$/);
    expect(data.slugSource).toBe(PublicSlugSource.patreon_default);
  });
});
