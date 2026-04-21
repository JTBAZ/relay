import { afterEach, describe, expect, it, vi } from "vitest";
import {
  checkPatreonLinkEmailGate,
  getSessionEmailVerifiedForPatronLink,
  patreonLinkRequiresVerifiedEmail
} from "../../src/identity/patreon-link-email-gate.js";

describe("patreonLinkRequiresVerifiedEmail", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is false by default", () => {
    delete process.env.RELAY_PATREON_LINK_REQUIRE_VERIFIED_EMAIL;
    expect(patreonLinkRequiresVerifiedEmail()).toBe(false);
  });

  it("is true for 1 or true", () => {
    vi.stubEnv("RELAY_PATREON_LINK_REQUIRE_VERIFIED_EMAIL", "1");
    expect(patreonLinkRequiresVerifiedEmail()).toBe(true);
    vi.stubEnv("RELAY_PATREON_LINK_REQUIRE_VERIFIED_EMAIL", "true");
    expect(patreonLinkRequiresVerifiedEmail()).toBe(true);
  });
});

describe("checkPatreonLinkEmailGate", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("allows when env gate off", async () => {
    delete process.env.RELAY_PATREON_LINK_REQUIRE_VERIFIED_EMAIL;
    const prisma = { account: { findUnique: vi.fn() } };
    const r = await checkPatreonLinkEmailGate(prisma as never, "acc");
    expect(r).toEqual({ ok: true });
    expect(prisma.account.findUnique).not.toHaveBeenCalled();
  });

  it("allows when gate on but account has no supabaseUserId", async () => {
    vi.stubEnv("RELAY_PATREON_LINK_REQUIRE_VERIFIED_EMAIL", "1");
    const prisma = {
      account: {
        findUnique: vi.fn().mockResolvedValue({ supabaseUserId: null })
      }
    };
    const r = await checkPatreonLinkEmailGate(prisma as never, "acc");
    expect(r).toEqual({ ok: true });
  });

  it("blocks when unverified", async () => {
    vi.stubEnv("RELAY_PATREON_LINK_REQUIRE_VERIFIED_EMAIL", "1");
    const prisma = {
      account: {
        findUnique: vi.fn().mockResolvedValue({ supabaseUserId: "su_1" })
      }
    };
    const r = await checkPatreonLinkEmailGate(prisma as never, "acc", {
      getUserById: async () => ({ email_confirmed_at: null })
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("EMAIL_NOT_VERIFIED");
      expect(r.httpStatus).toBe(403);
    }
  });

  it("allows when confirmed", async () => {
    vi.stubEnv("RELAY_PATREON_LINK_REQUIRE_VERIFIED_EMAIL", "1");
    const prisma = {
      account: {
        findUnique: vi.fn().mockResolvedValue({ supabaseUserId: "su_1" })
      }
    };
    const r = await checkPatreonLinkEmailGate(prisma as never, "acc", {
      getUserById: async () => ({ email_confirmed_at: "2026-01-01T00:00:00.000Z" })
    });
    expect(r).toEqual({ ok: true });
  });
});

describe("getSessionEmailVerifiedForPatronLink", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns true when gate off", async () => {
    delete process.env.RELAY_PATREON_LINK_REQUIRE_VERIFIED_EMAIL;
    const prisma = {
      tenantMembership: { findUnique: vi.fn() },
      account: { findUnique: vi.fn() }
    };
    const r = await getSessionEmailVerifiedForPatronLink(prisma as never, {
      user_id: "m1",
      creator_id: "c1",
      expires_at: new Date().toISOString()
    } as never);
    expect(r).toBe(true);
    expect(prisma.tenantMembership.findUnique).not.toHaveBeenCalled();
  });

  it("returns true when gate on but membership has no account", async () => {
    vi.stubEnv("RELAY_PATREON_LINK_REQUIRE_VERIFIED_EMAIL", "1");
    const prisma = {
      tenantMembership: {
        findUnique: vi.fn().mockResolvedValue(null)
      },
      account: { findUnique: vi.fn() }
    };
    const r = await getSessionEmailVerifiedForPatronLink(prisma as never, {
      user_id: "m1",
      creator_id: "c1",
      expires_at: new Date().toISOString()
    } as never);
    expect(r).toBe(true);
    expect(prisma.account.findUnique).not.toHaveBeenCalled();
  });
});
