import { describe, expect, it, vi } from "vitest";
import { promoteSnapshotToProfile } from "../../src/creator/creator-identity-service.js";

/**
 * APD-S4 — exercises the same code path the
 * `scripts/backfill-creator-profile-from-snapshot.mjs` script invokes for every
 * tenant. Pinning these invariants here is more reliable than spawning the
 * .mjs runner in CI.
 */

type ProfileRow = {
  id: string;
  tenantId: string;
  displayName: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  username: string | null;
  usernameNorm: string | null;
};

function makeStore(snapshot: Record<string, unknown> | null) {
  return { get: vi.fn(async () => snapshot) } as unknown;
}

function makePrisma(opts: {
  tenant?: { id: string } | null;
  profile?: ProfileRow | null;
  clashOnUsername?: boolean;
}) {
  const profile = opts.profile;
  return {
    tenant: {
      findUnique: vi.fn(async () => opts.tenant ?? null)
    },
    creatorProfile: {
      findFirst: vi.fn(async ({ where }: { where?: Record<string, unknown> }) => {
        if (where && "usernameNorm" in where) {
          return opts.clashOnUsername ? { id: "other" } : null;
        }
        return profile;
      }),
      update: vi.fn(async (args: { data: Record<string, unknown> }) => ({
        ...profile,
        ...args.data
      }))
    }
  } as unknown;
}

describe("backfill: promoteSnapshotToProfile (script-equivalent invariants)", () => {
  const baseProfile: ProfileRow = {
    id: "p1",
    tenantId: "t1",
    displayName: null,
    avatarUrl: null,
    bannerUrl: null,
    username: null,
    usernameNorm: null
  };

  it("is a no-op when the tenant has no snapshot", async () => {
    const prisma = makePrisma({ tenant: { id: "t1" }, profile: baseProfile });
    const store = makeStore(null);
    const result = await promoteSnapshotToProfile(
      prisma as never,
      store as never,
      "cr_x"
    );
    expect(result.promoted).toBe(false);
    const update = (prisma as { creatorProfile: { update: ReturnType<typeof vi.fn> } })
      .creatorProfile.update;
    expect(update).not.toHaveBeenCalled();
  });

  it("is a no-op when no tenant exists for the relay creator id", async () => {
    const prisma = makePrisma({ tenant: null, profile: baseProfile });
    const store = makeStore({
      patreon_campaign_id: "c",
      patreon_name: "anything",
      captured_at: new Date().toISOString()
    });
    const result = await promoteSnapshotToProfile(
      prisma as never,
      store as never,
      "cr_missing"
    );
    expect(result.promoted).toBe(false);
  });

  it("fills only NULL fields and never overwrites creator-authored edits", async () => {
    const prisma = makePrisma({
      tenant: { id: "t1" },
      profile: {
        ...baseProfile,
        displayName: "My Custom Name",
        bannerUrl: null
      }
    });
    const store = makeStore({
      patreon_campaign_id: "c",
      patreon_name: "patreonvanity",
      image_small_url: "https://cdn/avatar.jpg",
      image_url: "https://cdn/banner.jpg",
      captured_at: new Date().toISOString()
    });
    const result = await promoteSnapshotToProfile(
      prisma as never,
      store as never,
      "cr_x"
    );
    expect(result.promoted).toBe(true);
    const update = (prisma as { creatorProfile: { update: ReturnType<typeof vi.fn> } })
      .creatorProfile.update;
    expect(update).toHaveBeenCalledTimes(1);
    const data = update.mock.calls[0][0].data;
    expect(data.displayName).toBeUndefined();
    expect(data.bannerUrl).toBe("https://cdn/banner.jpg");
    expect(data.avatarUrl).toBe("https://cdn/avatar.jpg");
  });

  it("skips username promotion when the normalized vanity collides", async () => {
    const prisma = makePrisma({
      tenant: { id: "t1" },
      profile: { ...baseProfile },
      clashOnUsername: true
    });
    const store = makeStore({
      patreon_campaign_id: "c",
      patreon_name: "popular",
      image_small_url: "https://cdn/avatar.jpg",
      captured_at: new Date().toISOString()
    });
    const result = await promoteSnapshotToProfile(
      prisma as never,
      store as never,
      "cr_x"
    );
    expect(result.promoted).toBe(true);
    const update = (prisma as { creatorProfile: { update: ReturnType<typeof vi.fn> } })
      .creatorProfile.update;
    const data = update.mock.calls[0][0].data;
    expect(data.username).toBeUndefined();
    expect(data.usernameNorm).toBeUndefined();
    expect(data.avatarUrl).toBe("https://cdn/avatar.jpg");
  });

  it("running twice (idempotent) makes no further updates the second time", async () => {
    const updates: Array<Record<string, unknown>> = [];
    let row: ProfileRow = { ...baseProfile };
    const prisma = {
      tenant: { findUnique: vi.fn(async () => ({ id: "t1" })) },
      creatorProfile: {
        findFirst: vi.fn(async ({ where }: { where?: Record<string, unknown> }) => {
          if (where && "usernameNorm" in where) return null;
          return row;
        }),
        update: vi.fn(async (args: { data: Record<string, unknown> }) => {
          updates.push(args.data);
          row = { ...row, ...(args.data as Partial<ProfileRow>) };
          return row;
        })
      }
    } as unknown;
    const store = makeStore({
      patreon_campaign_id: "c",
      patreon_name: "studio",
      image_small_url: "https://cdn/avatar.jpg",
      image_url: "https://cdn/banner.jpg",
      captured_at: new Date().toISOString()
    });

    const first = await promoteSnapshotToProfile(prisma as never, store as never, "cr_x");
    const second = await promoteSnapshotToProfile(prisma as never, store as never, "cr_x");

    expect(first.promoted).toBe(true);
    expect(second.promoted).toBe(false);
    expect(updates).toHaveLength(1);
  });
});
