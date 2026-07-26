import { describe, expect, it, vi } from "vitest";
import { persistSubscribeStarProviderSnapshot } from "../src/subscribestar/persist-subscribestar-provider-snapshot.js";

describe("persistSubscribeStarProviderSnapshot", () => {
  it("updates creator profile scoped by tenant relay id", async () => {
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const prisma = { creatorProfile: { updateMany } } as never;
    await persistSubscribeStarProviderSnapshot(prisma, "cr_xyz", { a: 1 });
    expect(updateMany).toHaveBeenCalledWith({
      where: { tenant: { relayCreatorId: "cr_xyz" } },
      data: {
        subscribestarProviderSnapshot: { a: 1 },
        subscribestarProviderSnapshotAt: expect.any(Date)
      }
    });
  });
});
