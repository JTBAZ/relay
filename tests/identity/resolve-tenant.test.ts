import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import {
  resolveTenantByRelayCreatorId,
  resolveTenantBySlug
} from "../../src/identity/resolve-tenant.js";

describe("resolve-tenant", () => {
  it("resolveTenantBySlug returns null for empty/whitespace", async () => {
    const findUnique = vi.fn();
    const db = { creatorProfile: { findUnique } } as unknown as PrismaClient;
    expect(await resolveTenantBySlug("", db)).toBeNull();
    expect(await resolveTenantBySlug("   ", db)).toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("resolveTenantBySlug returns null when normalized slug is too short", async () => {
    const findUnique = vi.fn();
    const db = { creatorProfile: { findUnique } } as unknown as PrismaClient;
    expect(await resolveTenantBySlug("ab", db)).toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("resolveTenantBySlug returns null for unknown slug", async () => {
    const db = {
      creatorProfile: {
        findUnique: vi.fn().mockResolvedValue(null)
      }
    } as unknown as PrismaClient;
    expect(await resolveTenantBySlug("not-a-real-slug-zzz", db)).toBeNull();
  });

  it("resolveTenantBySlug returns TenantRef for known slug", async () => {
    const db = {
      creatorProfile: {
        findUnique: vi.fn().mockResolvedValue({
          publicSlug: "known-slug",
          tenant: { id: "ten_1", relayCreatorId: "cr_abc" }
        })
      }
    } as unknown as PrismaClient;
    const r = await resolveTenantBySlug("Known-Slug", db);
    expect(r).toEqual({
      id: "ten_1",
      relayCreatorId: "cr_abc",
      publicSlug: "known-slug"
    });
  });

  it("resolveTenantBySlug returns null when relayCreatorId is missing", async () => {
    const db = {
      creatorProfile: {
        findUnique: vi.fn().mockResolvedValue({
          publicSlug: "x",
          tenant: { id: "ten_1", relayCreatorId: null }
        })
      }
    } as unknown as PrismaClient;
    expect(await resolveTenantBySlug("x-y-z", db)).toBeNull();
  });

  it("resolveTenantByRelayCreatorId returns null for empty input", async () => {
    const findUnique = vi.fn();
    const db = { tenant: { findUnique } } as unknown as PrismaClient;
    expect(await resolveTenantByRelayCreatorId("", db)).toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("resolveTenantByRelayCreatorId returns null when tenant missing", async () => {
    const db = {
      tenant: { findUnique: vi.fn().mockResolvedValue(null) }
    } as unknown as PrismaClient;
    expect(await resolveTenantByRelayCreatorId("cr_nope", db)).toBeNull();
  });

  it("resolveTenantByRelayCreatorId trims and returns TenantRef", async () => {
    const findUnique = vi.fn().mockResolvedValue({
      id: "ten_x",
      relayCreatorId: "cr_x",
      creators: [{ publicSlug: "slug-x" }]
    });
    const db = { tenant: { findUnique } } as unknown as PrismaClient;
    const r = await resolveTenantByRelayCreatorId("  cr_x  ", db);
    expect(r).toEqual({
      id: "ten_x",
      relayCreatorId: "cr_x",
      publicSlug: "slug-x"
    });
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { relayCreatorId: "cr_x" }
      })
    );
  });
});
