import { describe, expect, it, vi } from "vitest";

const upsertFromAttempt = vi.fn();

vi.mock("../src/analytics/platform-instance-service.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/analytics/platform-instance-service.js")>();
  return {
    ...actual,
    upsertPlatformInstanceFromAttempt: (...args: unknown[]) => upsertFromAttempt(...args)
  };
});

import {
  confirmPlatformInstanceLink,
  normalizeCompleteDistributionIdentity
} from "../src/analytics/platform-instance-link-service.js";
import {
  platformInstanceIdForAttempt,
  platformInstanceIdForManualLink
} from "../src/analytics/platform-instance-service.js";

describe("normalizeCompleteDistributionIdentity", () => {
  it("canonicalizes X URLs and extracts status id", () => {
    const out = normalizeCompleteDistributionIdentity(
      "x",
      "https://twitter.com/handle/status/555",
      null
    );
    expect(out).toEqual({
      external_url: "https://x.com/handle/status/555",
      external_id: "555"
    });
  });

  it("passes through unsupported destinations unchanged", () => {
    const out = normalizeCompleteDistributionIdentity(
      "instagram",
      "https://instagram.com/p/abc",
      "abc"
    );
    expect(out).toEqual({
      external_url: "https://instagram.com/p/abc",
      external_id: "abc"
    });
  });
});

describe("confirmPlatformInstanceLink", () => {
  const CREATOR = "creator_a";
  const POST = "post_a";

  function basePrisma(overrides: Record<string, unknown> = {}) {
    return {
      tenant: { findUnique: vi.fn().mockResolvedValue({ id: "tenant_1" }) },
      post: { findFirst: vi.fn().mockResolvedValue({ id: POST }) },
      postDistributionVariant: { findFirst: vi.fn().mockResolvedValue(null) },
      postDistributionAttempt: {
        findFirst: vi.fn().mockResolvedValue(null),
        update: vi.fn().mockResolvedValue({})
      },
      platformInstance: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: vi.fn().mockResolvedValue({})
      },
      ...overrides
    };
  }

  it("creates manual platform instance when no attempt exists", async () => {
    const upsert = vi.fn().mockResolvedValue({});
    const prisma = basePrisma({
      platformInstance: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert
      }
    });

    const out = await confirmPlatformInstanceLink(prisma as never, CREATOR, {
      postId: POST,
      destination: "x",
      externalUrl: "https://x.com/artist/status/999"
    });

    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.link).toMatchObject({
      post_id: POST,
      destination: "x",
      external_id: "999",
      link_source: "manual_url_confirm",
      created: true,
      platform_instance_id: platformInstanceIdForManualLink(POST, "x")
    });
    expect(upsert).toHaveBeenCalled();
  });

  it("rejects instagram as unsupported destination", async () => {
    const prisma = basePrisma();
    const out = await confirmPlatformInstanceLink(prisma as never, CREATOR, {
      postId: POST,
      destination: "instagram",
      externalUrl: "https://instagram.com/p/abc"
    });
    expect(out).toEqual({
      ok: false,
      code: "UNSUPPORTED_DESTINATION",
      message: "Destination does not support URL identity linking yet."
    });
  });

  it("rejects URL that does not match destination", async () => {
    const prisma = basePrisma();
    const out = await confirmPlatformInstanceLink(prisma as never, CREATOR, {
      postId: POST,
      destination: "patreon",
      externalUrl: "https://x.com/handle/status/1"
    });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.code).toBe("URL_DESTINATION_MISMATCH");
  });

  it("upserts via attempt when distribution attempt exists", async () => {
    upsertFromAttempt.mockResolvedValue({
      platformInstanceId: platformInstanceIdForAttempt("attempt_1"),
      created: false
    });

    const attemptUpdate = vi.fn().mockResolvedValue({});
    const prisma = basePrisma({
      postDistributionAttempt: {
        findFirst: vi.fn().mockResolvedValue({ id: "attempt_1" }),
        update: attemptUpdate
      }
    });

    const out = await confirmPlatformInstanceLink(prisma as never, CREATOR, {
      postId: POST,
      destination: "deviantart",
      externalUrl: "https://www.deviantart.com/artist/art/My-Piece-42424242",
      attemptId: "attempt_1"
    });

    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.link.attempt_id).toBe("attempt_1");
    expect(attemptUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "attempt_1" },
        data: expect.objectContaining({
          externalId: "42424242",
          status: "posted"
        })
      })
    );
    expect(upsertFromAttempt).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({
        attemptId: "attempt_1",
        linkSource: "manual_url_confirm",
        externalId: "42424242"
      })
    );
  });
});
