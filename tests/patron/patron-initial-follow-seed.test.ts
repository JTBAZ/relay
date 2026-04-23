import { PatronFollowSeedSource } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { runPatronInitialFollowSeed } from "../../src/patron/patron-initial-follow-seed.js";

describe("runPatronInitialFollowSeed", () => {
  it("dedupes relay creator ids and writes PatronFollowSeed audit row", async () => {
    const createMany = vi.fn();
    const create = vi.fn();
    const prisma = {
      patronFollow: { createMany },
      patronFollowSeed: { create }
    };
    await runPatronInitialFollowSeed({
      prisma: prisma as never,
      patronMembershipId: "mem",
      relayCreatorIds: ["", "  ", "x", "x"],
      source: PatronFollowSeedSource.oauth_unified
    });
    expect(createMany).toHaveBeenCalledWith({
      data: [{ patronMembershipId: "mem", relayCreatorId: "x" }],
      skipDuplicates: true
    });
    expect(create).toHaveBeenCalledWith({
      data: {
        patronMembershipId: "mem",
        source: PatronFollowSeedSource.oauth_unified,
        relayCreatorIdsCount: 1
      }
    });
  });

  it("returns early when all ids empty", async () => {
    const createMany = vi.fn();
    const create = vi.fn();
    const prisma = {
      patronFollow: { createMany },
      patronFollowSeed: { create }
    };
    await runPatronInitialFollowSeed({
      prisma: prisma as never,
      patronMembershipId: "mem",
      relayCreatorIds: ["", "  "],
      source: PatronFollowSeedSource.initial_follow_worker
    });
    expect(createMany).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });
});
