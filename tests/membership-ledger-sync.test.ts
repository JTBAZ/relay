import { describe, expect, it } from "vitest";
import { CreatorMembershipEventType } from "@prisma/client";
import {
  parsePledgeRelationshipStart,
  planMembershipLedgerEvents,
  tierSignature
} from "../src/patreon/membership-ledger-sync.js";

const creatorId = "creator_test";
const memberId = "mem_123";
const batch = new Date("2026-05-10T12:00:00.000Z");
const pledge = new Date("2025-01-01T00:00:00.000Z");

describe("planMembershipLedgerEvents", () => {
  it("join when no prior account and active with tiers", () => {
    const ev = planMembershipLedgerEvents({
      creatorId,
      patreonMemberResourceId: memberId,
      patronStatus: "active_patron",
      newTierIds: ["patreon_tier_a"],
      entitledAmountCents: 500,
      pledgeRelationshipStart: pledge,
      priorExisted: false,
      priorTierIds: [],
      priorTierFloorCents: 0,
      batchStartedAt: batch
    });
    expect(ev).toHaveLength(1);
    expect(ev[0]!.eventType).toBe(CreatorMembershipEventType.join);
    expect(ev[0]!.occurredAt.toISOString()).toBe(pledge.toISOString());
  });

  it("rejoin when account existed but had no paid tiers", () => {
    const ev = planMembershipLedgerEvents({
      creatorId,
      patreonMemberResourceId: memberId,
      patronStatus: "active_patron",
      newTierIds: ["patreon_tier_a"],
      entitledAmountCents: 500,
      pledgeRelationshipStart: pledge,
      priorExisted: true,
      priorTierIds: [],
      priorTierFloorCents: 0,
      batchStartedAt: batch
    });
    expect(ev).toHaveLength(1);
    expect(ev[0]!.eventType).toBe(CreatorMembershipEventType.rejoin);
  });

  it("upgrade when floor increases", () => {
    const ev = planMembershipLedgerEvents({
      creatorId,
      patreonMemberResourceId: memberId,
      patronStatus: "active_patron",
      newTierIds: ["patreon_tier_b"],
      entitledAmountCents: 1000,
      pledgeRelationshipStart: pledge,
      priorExisted: true,
      priorTierIds: ["patreon_tier_a"],
      priorTierFloorCents: 500,
      batchStartedAt: batch
    });
    expect(ev).toHaveLength(1);
    expect(ev[0]!.eventType).toBe(CreatorMembershipEventType.upgrade);
    expect(ev[0]!.occurredAt.toISOString()).toBe(batch.toISOString());
  });

  it("downgrade when floor decreases", () => {
    const ev = planMembershipLedgerEvents({
      creatorId,
      patreonMemberResourceId: memberId,
      patronStatus: "active_patron",
      newTierIds: ["patreon_tier_a"],
      entitledAmountCents: 500,
      pledgeRelationshipStart: pledge,
      priorExisted: true,
      priorTierIds: ["patreon_tier_b"],
      priorTierFloorCents: 1000,
      batchStartedAt: batch
    });
    expect(ev).toHaveLength(1);
    expect(ev[0]!.eventType).toBe(CreatorMembershipEventType.downgrade);
  });

  it("cancel when not active and had paid tiers", () => {
    const ev = planMembershipLedgerEvents({
      creatorId,
      patreonMemberResourceId: memberId,
      patronStatus: "former_patron",
      newTierIds: [],
      entitledAmountCents: 0,
      pledgeRelationshipStart: null,
      priorExisted: true,
      priorTierIds: ["patreon_tier_a"],
      priorTierFloorCents: 500,
      batchStartedAt: batch
    });
    expect(ev).toHaveLength(1);
    expect(ev[0]!.eventType).toBe(CreatorMembershipEventType.cancel);
  });

  it("empty when tiers unchanged", () => {
    const t = ["patreon_tier_a", "patreon_tier_b"];
    expect(
      planMembershipLedgerEvents({
        creatorId,
        patreonMemberResourceId: memberId,
        patronStatus: "active_patron",
        newTierIds: [...t],
        entitledAmountCents: 500,
        pledgeRelationshipStart: pledge,
        priorExisted: true,
        priorTierIds: [...t],
        priorTierFloorCents: 500,
        batchStartedAt: batch
      })
    ).toHaveLength(0);
  });
});

describe("tierSignature + parsePledgeRelationshipStart", () => {
  it("sorts tier ids for stable compare", () => {
    expect(tierSignature(["z", "a"])).toBe("a|z");
  });

  it("parses ISO pledge start", () => {
    const d = parsePledgeRelationshipStart("2024-06-15T10:00:00.000Z");
    expect(d?.getUTCFullYear()).toBe(2024);
  });
});
