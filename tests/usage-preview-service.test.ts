import { describe, expect, it, vi } from "vitest";
import { getCreatorUsagePreview } from "../src/usage/usage-preview-service.js";

describe("getCreatorUsagePreview", () => {
  it("returns null when tenant is missing", async () => {
    const prisma = {
      tenant: { findUnique: vi.fn().mockResolvedValue(null) }
    } as never;
    await expect(getCreatorUsagePreview(prisma, "cr_x", 30)).resolves.toBeNull();
  });

  it("groups known metrics with zero defaults", async () => {
    const groupBy = vi.fn().mockResolvedValue([
      { metric: "export.media.content.bytes", _sum: { quantity: 1024n } },
      { metric: "export.library_zip.completed", _sum: { quantity: 3n } }
    ]);
    const prisma = {
      tenant: { findUnique: vi.fn().mockResolvedValue({ id: "t1" }) },
      usageEvent: { groupBy }
    } as never;

    const out = await getCreatorUsagePreview(prisma, "cr_y", 7);
    expect(out).not.toBeNull();
    expect(out!.window.days).toBe(7);
    expect(out!.disclaimer.toLowerCase()).toContain("beta");
    expect(out!.bars.find((b) => b.metric === "export.media.content.bytes")?.quantity).toBe(
      "1024"
    );
    expect(out!.bars.find((b) => b.metric === "api.rate_limited")?.quantity).toBe("0");
    expect(out!.bars.find((b) => b.metric === "export.library_zip.completed")?.quantity).toBe(
      "3"
    );

    expect(groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        by: ["metric"],
        where: expect.objectContaining({
          tenantId: "t1",
          metric: { in: expect.any(Array) }
        }),
        _sum: { quantity: true }
      })
    );
  });
});
