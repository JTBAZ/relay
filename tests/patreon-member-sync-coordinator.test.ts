import { describe, expect, it, vi } from "vitest";
import { PatreonMemberSyncCoordinator } from "../src/patreon/patreon-member-sync-coordinator.js";
import type { PatreonSyncService } from "../src/patreon/patreon-sync-service.js";
import type { PatreonSyncHealthStore } from "../src/patreon/patreon-sync-health-store.js";

describe("PatreonMemberSyncCoordinator", () => {
  it("awaits durable execution and records success", async () => {
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

    const c = new PatreonMemberSyncCoordinator(syncService, healthStore);
    await c.runMemberSync("c1", "99");
    expect(syncMembers).toHaveBeenCalledTimes(1);
    expect(recordOk).toHaveBeenCalledWith(expect.objectContaining({ members_synced: 1 }));
  });
  it("records failed member sync and propagates it for durable retry", async () => {
    const error = new Error("Patreon retry required");
    const fail = vi.fn().mockResolvedValue(undefined);
    const coordinator = new PatreonMemberSyncCoordinator({ syncMembers: vi.fn().mockRejectedValue(error) } as unknown as PatreonSyncService,
      { recordMemberSyncFailure: fail } as unknown as PatreonSyncHealthStore);
    await expect(coordinator.runMemberSync("c1", "99")).rejects.toBe(error);
    expect(fail).toHaveBeenCalledWith(expect.objectContaining({ error: expect.objectContaining({ code: "patreon_retry_required" }) }));
  });
});
