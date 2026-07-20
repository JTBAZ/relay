import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";

const upsertFromAttempt = vi.fn().mockResolvedValue({
  platformInstanceId: "pi_attempt_test",
  created: true
});

vi.mock("../src/analytics/platform-instance-service.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/analytics/platform-instance-service.js")>();
  return {
    ...actual,
    upsertPlatformInstanceFromAttempt: (...args: unknown[]) => upsertFromAttempt(...args)
  };
});

import { completeDistributionAttempt } from "../src/distribution/post-distribution-service.js";

const CREATOR_ID = "cr_promo_stamp";
const POST_ID = "post_promo_stamp";
const ATTEMPT_ID = "pda_promo_stamp";
const VARIANT_ID = "pdv_promo_stamp";

function baseAttemptRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ATTEMPT_ID,
    variantId: VARIANT_ID,
    postId: POST_ID,
    creatorId: CREATOR_ID,
    destination: "x",
    status: "fill_succeeded",
    extensionTabId: null,
    fillResult: {},
    externalUrl: null,
    externalId: null,
    errorCode: null,
    errorDetail: null,
    startedAt: new Date("2026-07-08T18:00:00.000Z"),
    completedAt: null,
    variant: {
      platformFields: {
        media_version: "preview",
        analytics_content_role: "promo"
      }
    },
    ...overrides
  };
}

describe("completeDistributionAttempt promo platform instance", () => {
  it("stamps contentVariantRole promo when variant used preview routing", async () => {
    upsertFromAttempt.mockClear();
    const attemptUpdate = vi.fn().mockResolvedValue(
      baseAttemptRow({
        status: "posted",
        externalUrl: "https://x.com/handle/status/99",
        externalId: "99",
        completedAt: new Date("2026-07-08T18:05:00.000Z"),
        variant: undefined
      })
    );
    const variantUpdate = vi.fn().mockResolvedValue({});

    const prisma = {
      postDistributionAttempt: {
        findFirst: vi.fn().mockResolvedValue(baseAttemptRow()),
        update: attemptUpdate
      },
      $transaction: vi.fn(async (fn) =>
        fn({
          postDistributionAttempt: { update: attemptUpdate },
          postDistributionVariant: { update: variantUpdate }
        })
      )
    } as unknown as PrismaClient;

    await completeDistributionAttempt(prisma, CREATOR_ID, ATTEMPT_ID, {
      status: "posted",
      external_url: "https://x.com/handle/status/99",
      external_id: "99"
    });

    expect(upsertFromAttempt).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        attemptId: ATTEMPT_ID,
        destination: "x",
        contentVariantRole: "promo"
      })
    );
  });

  it("omits promo role for full-routing variants", async () => {
    upsertFromAttempt.mockClear();
    const attemptUpdate = vi.fn().mockResolvedValue(
      baseAttemptRow({
        status: "posted",
        destination: "patreon",
        externalUrl: "https://patreon.com/posts/1",
        externalId: "1",
        completedAt: new Date("2026-07-08T18:05:00.000Z"),
        variant: undefined
      })
    );

    const prisma = {
      postDistributionAttempt: {
        findFirst: vi.fn().mockResolvedValue(
          baseAttemptRow({
            destination: "patreon",
            variant: { platformFields: { media_version: "full" } }
          })
        )
      },
      $transaction: vi.fn(async (fn) =>
        fn({
          postDistributionAttempt: { update: attemptUpdate },
          postDistributionVariant: { update: vi.fn().mockResolvedValue({}) }
        })
      )
    } as unknown as PrismaClient;

    await completeDistributionAttempt(prisma, CREATOR_ID, ATTEMPT_ID, {
      status: "posted",
      external_url: "https://patreon.com/posts/1",
      external_id: "1"
    });

    expect(upsertFromAttempt).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        destination: "patreon",
        contentVariantRole: null
      })
    );
  });
});
