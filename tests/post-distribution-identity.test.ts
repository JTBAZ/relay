import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import {
  completeDistributionAttempt,
  getPostDistributionSummary
} from "../src/distribution/post-distribution-service.js";

const CREATOR_ID = "rcx_pilot_dev_ava";
const POST_ID = "post_test_001";
const ATTEMPT_ID = "pda_6f0d6302-0e6c-4e87-a7b0-a6a6234979e4";
const VARIANT_ID = "pdv_variant_001";
const EXTERNAL_URL = "https://www.patreon.com/RelayTEST/posts/test-162544992";
const EXTERNAL_ID = "162544992";

function baseAttemptRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ATTEMPT_ID,
    variantId: VARIANT_ID,
    postId: POST_ID,
    creatorId: CREATOR_ID,
    destination: "patreon",
    status: "fill_succeeded",
    extensionTabId: 736928937,
    fillResult: { title_ok: true, body_ok: true },
    externalUrl: null,
    externalId: null,
    errorCode: null,
    errorDetail: null,
    startedAt: new Date("2026-06-30T18:00:00.000Z"),
    completedAt: null,
    variant: { platformFields: { media_version: "full" } },
    ...overrides
  };
}

describe("post distribution identity contract (Slice 1)", () => {
  it("persists external_url and external_id when completing a posted attempt", async () => {
    const attemptUpdate = vi.fn().mockResolvedValue(
      baseAttemptRow({
        status: "posted",
        externalUrl: EXTERNAL_URL,
        externalId: EXTERNAL_ID,
        completedAt: new Date("2026-06-30T18:05:00.000Z")
      })
    );
    const variantUpdate = vi.fn().mockResolvedValue({});

    const prisma = {
      postDistributionAttempt: {
        findFirst: vi.fn().mockResolvedValue(baseAttemptRow())
      },
      postDistributionVariant: { findFirst: vi.fn().mockResolvedValue(null) },
      postbotTask: { findFirst: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn(async (fn) =>
        fn({
          postDistributionAttempt: { update: attemptUpdate },
          postDistributionVariant: { update: variantUpdate },
          platformInstance: {
            findUnique: vi.fn().mockResolvedValue(null),
            upsert: vi.fn().mockResolvedValue({})
          }
        })
      )
    } as unknown as PrismaClient;

    const attempt = await completeDistributionAttempt(prisma, CREATOR_ID, ATTEMPT_ID, {
      status: "posted",
      external_url: `${EXTERNAL_URL}?pr=true`,
      external_id: EXTERNAL_ID
    });

    expect(attempt.status).toBe("posted");
    expect(attempt.external_url).toBe(EXTERNAL_URL);
    expect(attempt.external_id).toBe(EXTERNAL_ID);
    expect(attemptUpdate).toHaveBeenCalledWith({
      where: { id: ATTEMPT_ID },
      data: expect.objectContaining({
        status: "posted",
        externalUrl: EXTERNAL_URL,
        externalId: EXTERNAL_ID
      })
    });
    expect(variantUpdate).toHaveBeenCalledWith({
      where: { id: VARIANT_ID },
      data: { status: "posted" }
    });
  });

  it("allows posted completion without external_url for manual confirm fallback", async () => {
    const attemptUpdate = vi.fn().mockResolvedValue(
      baseAttemptRow({
        status: "posted",
        externalUrl: null,
        externalId: null,
        completedAt: new Date("2026-06-30T18:05:00.000Z")
      })
    );

    const prisma = {
      postDistributionAttempt: {
        findFirst: vi.fn().mockResolvedValue(baseAttemptRow())
      },
      postDistributionVariant: { findFirst: vi.fn().mockResolvedValue(null) },
      postbotTask: { findFirst: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn(async (fn) =>
        fn({
          postDistributionAttempt: { update: attemptUpdate },
          postDistributionVariant: { update: vi.fn().mockResolvedValue({}) }
        })
      )
    } as unknown as PrismaClient;

    const attempt = await completeDistributionAttempt(prisma, CREATOR_ID, ATTEMPT_ID, {
      status: "posted"
    });

    expect(attempt.status).toBe("posted");
    expect(attempt.external_url).toBeNull();
    expect(attempt.external_id).toBeNull();
  });

  it("returns attempt_id, external_url, and external_id in distribution summary", async () => {
    const prisma = {
      postDistributionVariant: {
        findMany: vi.fn().mockResolvedValue([
          {
            destination: "patreon",
            status: "posted",
            postId: POST_ID,
            creatorId: CREATOR_ID,
            attempts: [
              {
                id: ATTEMPT_ID,
                status: "posted",
                externalUrl: EXTERNAL_URL,
                externalId: EXTERNAL_ID
              }
            ]
          }
        ])
      }
    } as unknown as PrismaClient;

    const summary = await getPostDistributionSummary(prisma, CREATOR_ID, POST_ID);
    const patreon = summary.destinations.find((row) => row.destination === "patreon");

    expect(patreon).toEqual({
      destination: "patreon",
      variant_status: "posted",
      attempt_status: "posted",
      attempt_id: ATTEMPT_ID,
      external_url: EXTERNAL_URL,
      external_id: EXTERNAL_ID
    });
  });
});
