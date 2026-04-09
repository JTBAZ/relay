import { describe, expect, it, vi } from "vitest";
import { PatreonMemberSyncCoordinator } from "../src/patreon/patreon-member-sync-coordinator.js";
import type { PatreonSyncService } from "../src/patreon/patreon-sync-service.js";
import type { PatreonSyncHealthStore } from "../src/patreon/patreon-sync-health-store.js";

describe("PatreonMemberSyncCoordinator", () => {
  it("debounces two rapid schedules into one syncMembers call", async () => {
    vi.useFakeTimers();
    const syncMembers = vi.fn().mockResolvedValue({
      creator_id: "c1",
      patreon_campaign_id: "99",
      members_synced: 1,
      pages_fetched: 1,
      warnings: []
    });
    const recordOk = vi.fn().mockResolvedValue(undefined);
    const syncService = { syncMembers } as unknown as PatreonSyncService;
    const healthStore = {
      recordMemberSyncSuccess: recordOk,
      recordMemberSyncFailure: vi.fn()
    } as unknown as PatreonSyncHealthStore;

    const c = new PatreonMemberSyncCoordinator(syncService, healthStore, 1000);
    c.scheduleMemberSync("c1", "99");
    c.scheduleMemberSync("c1", "99");
    await vi.advanceTimersByTimeAsync(1000);
    expect(syncMembers).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
