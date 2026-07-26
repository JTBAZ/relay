/**
 * @fileoverview Curator support-summary ledger payload (MB-14).
 */
import { ArtistLedgerEntryKind, FanPlan, TipEntryKind } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { getCuratorSupportSummary } from "../src/patron/curator-perks-service.js";
import { activeCuratorMembershipIds, isActiveCuratorForAccount } from "../src/patron/curator-status.js";

describe("curator-perks-payload", () => {
  it("returns null when fan premium is off", async () => {
    const prisma = {} as never;
    expect(
      await getCuratorSupportSummary(prisma, "acct_1", {
        env: { RELAY_FAN_PREMIUM_ENABLED: "0" }
      })
    ).toBeNull();
  });

  it("aggregates tips spent, artists supported, and cents routed from ledger fixtures", async () => {
    const now = new Date("2026-07-16T12:00:00.000Z");
    const prisma = {
      planSubscription: {
        findFirst: vi.fn(async () => ({
          fanPlan: FanPlan.curator,
          status: "active",
          currentPeriodEnd: new Date("2026-08-01T00:00:00.000Z"),
          cancelAtPeriodEnd: false
        }))
      },
      tipLedgerEntry: {
        aggregate: vi.fn(async () => ({ _sum: { tips: -3 } }))
      },
      tipReveal: {
        findMany: vi.fn(
          async ({ distinct }: { distinct?: string[] }) => {
            if (distinct?.includes("creatorId")) {
              return [{ creatorId: "c1" }, { creatorId: "c2" }];
            }
            return [{ id: "rev_1" }, { id: "rev_2" }, { id: "rev_3" }];
          }
        )
      },
      artistLedgerEntry: {
        aggregate: vi.fn(async () => ({ _sum: { amountCents: 99 } }))
      }
    } as never;

    const wire = await getCuratorSupportSummary(prisma, "acct_cur", {
      now,
      env: { RELAY_FAN_PREMIUM_ENABLED: "1" }
    });
    expect(wire).toEqual({
      plan: "curator",
      is_curator: true,
      period_start: "2026-07-01T00:00:00.000Z",
      tips_spent: 3,
      artists_supported: 2,
      cents_routed_to_artists: 99,
      boosts_coming_copy: "Boosts are coming for Curators"
    });
    expect(prisma.tipLedgerEntry.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          accountId: "acct_cur",
          entryKind: TipEntryKind.spend
        })
      })
    );
    expect(prisma.artistLedgerEntry.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          entryKind: ArtistLedgerEntryKind.tip_earned,
          revealId: { in: ["rev_1", "rev_2", "rev_3"] }
        })
      })
    );
  });

  it("hides boosts copy when RELAY_CURATOR_BOOSTS_COMING_COPY=off", async () => {
    const prisma = {
      planSubscription: {
        findFirst: vi.fn(async () => ({
          fanPlan: FanPlan.curator,
          status: "active",
          currentPeriodEnd: new Date(),
          cancelAtPeriodEnd: false
        }))
      },
      tipLedgerEntry: { aggregate: vi.fn(async () => ({ _sum: { tips: 0 } })) },
      tipReveal: { findMany: vi.fn(async () => []) },
      artistLedgerEntry: { aggregate: vi.fn(async () => ({ _sum: { amountCents: 0 } })) }
    } as never;

    const wire = await getCuratorSupportSummary(prisma, "acct_cur", {
      env: {
        RELAY_FAN_PREMIUM_ENABLED: "1",
        RELAY_CURATOR_BOOSTS_COMING_COPY: "off"
      }
    });
    expect(wire?.boosts_coming_copy).toBeNull();
    expect(wire?.is_curator).toBe(true);
  });

  it("isActiveCuratorForAccount is false for lapsed / non-curator", async () => {
    const prismaLapsed = {
      planSubscription: {
        findFirst: vi.fn(async () => null)
      }
    } as never;
    expect(
      await isActiveCuratorForAccount(prismaLapsed, "a1", {
        RELAY_FAN_PREMIUM_ENABLED: "1"
      })
    ).toBe(false);

    const prismaSupporter = {
      planSubscription: {
        findFirst: vi.fn(async () => ({
          fanPlan: FanPlan.supporter,
          status: "active",
          currentPeriodEnd: new Date(),
          cancelAtPeriodEnd: false
        }))
      }
    } as never;
    expect(
      await isActiveCuratorForAccount(prismaSupporter, "a1", {
        RELAY_FAN_PREMIUM_ENABLED: "1"
      })
    ).toBe(false);
  });

  it("activeCuratorMembershipIds batches live curator memberships", async () => {
    const prisma = {
      tenantMembership: {
        findMany: vi.fn(async () => [
          { id: "m_cur", accountId: "a_cur" },
          { id: "m_free", accountId: "a_free" }
        ])
      },
      planSubscription: {
        findMany: vi.fn(async () => [{ accountId: "a_cur" }])
      }
    } as never;
    const set = await activeCuratorMembershipIds(prisma, ["m_cur", "m_free"], {
      RELAY_FAN_PREMIUM_ENABLED: "1"
    });
    expect([...set]).toEqual(["m_cur"]);
  });
});
