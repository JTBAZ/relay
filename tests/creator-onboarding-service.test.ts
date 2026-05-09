import { describe, expect, it, vi } from "vitest";
import type { CreatorOnboardingStep, PrismaClient } from "@prisma/client";
import {
  ensureCreatorOnboardingAtLeastImportStarted,
  getCreatorOnboardingForStudio,
  getLayoutPublishBlock,
  patchCreatorOnboarding
} from "../src/creator/onboarding-service.js";

describe("getCreatorOnboardingForStudio", () => {
  it("returns existing row and import_progress from CreatorSyncState JSON", async () => {
    const updatedAt = new Date("2026-05-08T12:00:00.000Z");
    const create = vi.fn();
    const onboardingFind = vi.fn().mockResolvedValue({
      step: "import_started" as CreatorOnboardingStep,
      metadata: { k: 1 },
      updatedAt
    });
    const syncFind = vi.fn().mockResolvedValue({
      lastPostScrape: {
        finished_at: "2026-05-08T11:00:00.000Z",
        ok: true,
        apply_result: { posts_written: 12 }
      }
    });
    const prisma = {
      creatorOnboardingState: { findUnique: onboardingFind, create },
      creatorSyncState: { findUnique: syncFind }
    } as unknown as PrismaClient;

    const out = await getCreatorOnboardingForStudio(prisma, "cr_test");

    expect(out).toEqual({
      creator_id: "cr_test",
      step: "import_started",
      metadata: { k: 1 },
      updated_at: updatedAt.toISOString(),
      import_progress: {
        last_post_scrape_finished_at: "2026-05-08T11:00:00.000Z",
        last_post_scrape_ok: true,
        last_post_scrape_posts_written: 12
      }
    });
    expect(create).not.toHaveBeenCalled();
  });

  it("creates connected row when missing", async () => {
    const updatedAt = new Date("2026-05-08T12:00:00.000Z");
    const create = vi.fn().mockResolvedValue({
      step: "connected" as CreatorOnboardingStep,
      metadata: null,
      updatedAt
    });
    const onboardingFind = vi.fn().mockResolvedValue(null);
    const syncFind = vi.fn().mockResolvedValue(null);
    const prisma = {
      creatorOnboardingState: { findUnique: onboardingFind, create },
      creatorSyncState: { findUnique: syncFind }
    } as unknown as PrismaClient;

    const out = await getCreatorOnboardingForStudio(prisma, "cr_new");
    expect(out.step).toBe("connected");
    expect(out.import_progress).toBeNull();
    expect(create).toHaveBeenCalledWith({
      data: { creatorId: "cr_new", step: "connected" },
      select: { step: true, metadata: true, updatedAt: true }
    });
  });

  it("returns identical read model on repeat load when row unchanged (P4-onb-009)", async () => {
    const updatedAt = new Date("2026-05-08T12:00:00.000Z");
    const create = vi.fn();
    const onboardingFind = vi.fn().mockResolvedValue({
      step: "published" as CreatorOnboardingStep,
      metadata: null,
      updatedAt
    });
    const syncFind = vi.fn().mockResolvedValue(null);
    const prisma = {
      creatorOnboardingState: { findUnique: onboardingFind, create },
      creatorSyncState: { findUnique: syncFind }
    } as unknown as PrismaClient;

    const a = await getCreatorOnboardingForStudio(prisma, "cr_live");
    const b = await getCreatorOnboardingForStudio(prisma, "cr_live");
    expect(a).toEqual(b);
    expect(create).not.toHaveBeenCalled();
  });
});

describe("ensureCreatorOnboardingAtLeastImportStarted", () => {
  it("creates import_started when no row", async () => {
    const findUnique = vi.fn().mockResolvedValue(null);
    const create = vi.fn().mockResolvedValue(undefined);
    const update = vi.fn();
    const prisma = {
      creatorOnboardingState: { findUnique, create, update }
    } as unknown as PrismaClient;

    await ensureCreatorOnboardingAtLeastImportStarted(prisma, "cr_oauth");

    expect(findUnique).toHaveBeenCalledWith({
      where: { creatorId: "cr_oauth" },
      select: { step: true }
    });
    expect(create).toHaveBeenCalledWith({
      data: { creatorId: "cr_oauth", step: "import_started" }
    });
    expect(update).not.toHaveBeenCalled();
  });

  it("bumps connected to import_started", async () => {
    const findUnique = vi.fn().mockResolvedValue({ step: "connected" as CreatorOnboardingStep });
    const create = vi.fn();
    const update = vi.fn().mockResolvedValue(undefined);
    const prisma = {
      creatorOnboardingState: { findUnique, create, update }
    } as unknown as PrismaClient;

    await ensureCreatorOnboardingAtLeastImportStarted(prisma, "cr_oauth");

    expect(create).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith({
      where: { creatorId: "cr_oauth" },
      data: { step: "import_started" }
    });
  });

  it.each([
    ["import_started"],
    ["organized"],
    ["published"]
  ] as const)("no-op when already at %s", async (step) => {
    const findUnique = vi.fn().mockResolvedValue({ step });
    const create = vi.fn();
    const update = vi.fn();
    const prisma = {
      creatorOnboardingState: { findUnique, create, update }
    } as unknown as PrismaClient;

    await ensureCreatorOnboardingAtLeastImportStarted(prisma, "cr_late");

    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("no-ops for empty creator id", async () => {
    const findUnique = vi.fn();
    const prisma = {
      creatorOnboardingState: { findUnique, create: vi.fn(), update: vi.fn() }
    } as unknown as PrismaClient;

    await ensureCreatorOnboardingAtLeastImportStarted(prisma, "   ");

    expect(findUnique).not.toHaveBeenCalled();
  });
});

describe("getLayoutPublishBlock", () => {
  it("returns null when no onboarding row (legacy)", async () => {
    const prisma = {
      creatorOnboardingState: {
        findUnique: vi.fn().mockResolvedValue(null)
      },
      creatorSyncState: {
        findUnique: vi.fn().mockResolvedValue(null)
      }
    } as unknown as PrismaClient;

    expect(await getLayoutPublishBlock(prisma, "cr_legacy")).toBeNull();
  });

  it("blocks when onboarding exists but step is not published", async () => {
    const prisma = {
      creatorOnboardingState: {
        findUnique: vi.fn().mockResolvedValue({ step: "organized" as CreatorOnboardingStep })
      },
      creatorSyncState: { findUnique: vi.fn() }
    } as unknown as PrismaClient;

    expect(await getLayoutPublishBlock(prisma, "cr_x")).toEqual({
      code: "ONBOARDING_INCOMPLETE",
      current_step: "organized"
    });
    expect(prisma.creatorSyncState.findUnique).not.toHaveBeenCalled();
  });

  it("allows when step is published and no scrape failure", async () => {
    const prisma = {
      creatorOnboardingState: {
        findUnique: vi.fn().mockResolvedValue({ step: "published" as CreatorOnboardingStep })
      },
      creatorSyncState: {
        findUnique: vi.fn().mockResolvedValue({
          lastPostScrape: { finished_at: "2026-01-01", ok: true }
        })
      }
    } as unknown as PrismaClient;

    expect(await getLayoutPublishBlock(prisma, "cr_ok")).toBeNull();
  });

  it("blocks when last post scrape ok is false", async () => {
    const prisma = {
      creatorOnboardingState: {
        findUnique: vi.fn().mockResolvedValue({ step: "published" as CreatorOnboardingStep })
      },
      creatorSyncState: {
        findUnique: vi.fn().mockResolvedValue({
          lastPostScrape: {
            finished_at: "2026-01-01",
            ok: false,
            error: { code: "x", message: "bad", hint: "" }
          }
        })
      }
    } as unknown as PrismaClient;

    expect(await getLayoutPublishBlock(prisma, "cr_bad")).toEqual({
      code: "SYNC_POST_SCRAPE_FAILED",
      message: "bad"
    });
  });
});

describe("patchCreatorOnboarding", () => {
  it("rejects skip-ahead before update", async () => {
    const updatedAt = new Date("2026-05-08T12:00:00.000Z");
    const update = vi.fn();
    const prisma = {
      creatorOnboardingState: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ step: "connected" as CreatorOnboardingStep, metadata: null, updatedAt }),
        create: vi.fn(),
        update
      },
      creatorSyncState: { findUnique: vi.fn().mockResolvedValue(null) }
    } as unknown as PrismaClient;

    await expect(
      patchCreatorOnboarding(prisma, "cr_x", { step: "organized" })
    ).rejects.toMatchObject({ name: "OnboardingTransitionError", reason: "skip_ahead" });
    expect(update).not.toHaveBeenCalled();
  });

  it("advances one step and returns read shape", async () => {
    const t0 = new Date("2026-05-08T11:00:00.000Z");
    const t1 = new Date("2026-05-08T12:00:00.000Z");
    const prisma = {
      creatorOnboardingState: {
        findUnique: vi.fn().mockResolvedValue({
          step: "connected" as CreatorOnboardingStep,
          metadata: null,
          updatedAt: t0
        }),
        create: vi.fn(),
        update: vi.fn().mockResolvedValue({
          step: "import_started" as CreatorOnboardingStep,
          metadata: null,
          updatedAt: t1
        })
      },
      creatorSyncState: { findUnique: vi.fn().mockResolvedValue(null) }
    } as unknown as PrismaClient;

    const out = await patchCreatorOnboarding(prisma, "cr_y", { step: "import_started" });
    expect(out.step).toBe("import_started");
    expect(out.creator_id).toBe("cr_y");
    expect(prisma.creatorOnboardingState.update).toHaveBeenCalledWith({
      where: { creatorId: "cr_y" },
      data: { step: "import_started" },
      select: { step: true, metadata: true, updatedAt: true }
    });
  });

  it("throws OnboardingTransitionError for invalid step string after guard", async () => {
    const prisma = {
      creatorOnboardingState: {
        findUnique: vi.fn().mockResolvedValue({
          step: "connected" as CreatorOnboardingStep,
          metadata: null,
          updatedAt: new Date()
        }),
        create: vi.fn(),
        update: vi.fn()
      },
      creatorSyncState: { findUnique: vi.fn() }
    } as unknown as PrismaClient;

    // pathological: bypass TS — service validates via isValidOnboardingStep
    await expect(
      patchCreatorOnboarding(prisma, "cr_z", { step: "nope" as CreatorOnboardingStep })
    ).rejects.toMatchObject({
      name: "OnboardingTransitionError",
      reason: "invalid_step"
    });
  });
});