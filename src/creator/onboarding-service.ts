/**
 * P4-onb-002 / P4-onb-003 / P4-onb-004 — Read, patch, and OAuth-driven onboarding advancement.
 */

import type { CreatorOnboardingStep, PrismaClient } from "@prisma/client";
import { Prisma } from "@prisma/client";

/** Linear funnel: UI may only advance one step at a time via PATCH (P4-onb-003). */
export const CREATOR_ONBOARDING_STEP_ORDER: readonly CreatorOnboardingStep[] = [
  "connected",
  "import_started",
  "organized",
  "published"
] as const;

export function creatorOnboardingStepIndex(step: CreatorOnboardingStep): number {
  const i = CREATOR_ONBOARDING_STEP_ORDER.indexOf(step);
  if (i < 0) {
    throw new Error(`Unknown CreatorOnboardingStep: ${String(step)}`);
  }
  return i;
}

/**
 * After Patreon creator OAuth token persistence succeeds: ensure funnel is at least `import_started`.
 * Creates the row at `import_started` when missing; bumps `connected` → `import_started`; no-op if already past.
 */
export async function ensureCreatorOnboardingAtLeastImportStarted(
  prisma: PrismaClient,
  relayCreatorId: string
): Promise<void> {
  const creatorId = relayCreatorId.trim();
  if (!creatorId) {
    return;
  }

  const minIdx = creatorOnboardingStepIndex("import_started");
  const row = await prisma.creatorOnboardingState.findUnique({
    where: { creatorId },
    select: { step: true }
  });

  if (!row) {
    await prisma.creatorOnboardingState.create({
      data: { creatorId, step: "import_started" }
    });
    return;
  }

  if (creatorOnboardingStepIndex(row.step) >= minIdx) {
    return;
  }

  await prisma.creatorOnboardingState.update({
    where: { creatorId },
    data: { step: "import_started" }
  });
}

/** P4-onb-006 — reasons layout publish may be blocked when Prisma is configured. */
export type LayoutPublishBlock =
  | { code: "ONBOARDING_INCOMPLETE"; current_step: CreatorOnboardingStep }
  | { code: "SYNC_POST_SCRAPE_FAILED"; message?: string };

/**
 * When an onboarding row exists, layout publish requires step `published`. Legacy creators (no row) are not blocked by onboarding.
 * Post scrape: if `CreatorSyncState.lastPostScrape` records `ok: false`, publish is blocked.
 */
export async function getLayoutPublishBlock(
  prisma: PrismaClient,
  relayCreatorId: string
): Promise<LayoutPublishBlock | null> {
  const creatorId = relayCreatorId.trim();
  if (!creatorId) {
    return null;
  }

  const onboarding = await prisma.creatorOnboardingState.findUnique({
    where: { creatorId },
    select: { step: true }
  });
  if (onboarding && onboarding.step !== "published") {
    return { code: "ONBOARDING_INCOMPLETE", current_step: onboarding.step };
  }

  const syncRow = await prisma.creatorSyncState.findUnique({
    where: { creatorId },
    select: { lastPostScrape: true }
  });
  const scrape = syncRow?.lastPostScrape;
  if (scrape != null && typeof scrape === "object" && !Array.isArray(scrape)) {
    const ok = (scrape as Record<string, unknown>).ok;
    if (ok === false) {
      const err = (scrape as Record<string, unknown>).error;
      let message: string | undefined;
      if (err != null && typeof err === "object" && !Array.isArray(err)) {
        const m = (err as Record<string, unknown>).message;
        if (typeof m === "string" && m.trim()) {
          message = m;
        }
      }
      return { code: "SYNC_POST_SCRAPE_FAILED", message };
    }
  }

  return null;
}

export class OnboardingTransitionError extends Error {
  public override readonly name = "OnboardingTransitionError";

  public constructor(
    message: string,
    public readonly reason: "skip_ahead" | "step_back" | "invalid_step"
  ) {
    super(message);
  }
}

/**
 * @throws {@link OnboardingTransitionError} when `target` is not the current step or the single next step.
 */
export function assertCreatorOnboardingTransition(
  current: CreatorOnboardingStep,
  target: CreatorOnboardingStep
): void {
  const a = creatorOnboardingStepIndex(current);
  const b = creatorOnboardingStepIndex(target);
  if (b === a) {
    return;
  }
  if (b === a + 1) {
    return;
  }
  if (b > a + 1) {
    throw new OnboardingTransitionError(
      `Cannot skip onboarding step from "${current}" to "${target}". Advance one step at a time.`,
      "skip_ahead"
    );
  }
  throw new OnboardingTransitionError(
    `Cannot move onboarding backward from "${current}" to "${target}".`,
    "step_back"
  );
}

export type PatchCreatorOnboardingInput = {
  step?: CreatorOnboardingStep;
  /** Replaces stored metadata when the key is present (`null` clears the column). Omitted leaves metadata unchanged. */
  metadata?: Prisma.InputJsonValue | null;
};

function isValidOnboardingStep(raw: unknown): raw is CreatorOnboardingStep {
  return (
    raw === "connected" ||
    raw === "import_started" ||
    raw === "organized" ||
    raw === "published"
  );
}

/**
 * Updates step and/or metadata. Ensures a row exists. Rejects skip-ahead and backward transitions.
 */
export async function patchCreatorOnboarding(
  prisma: PrismaClient,
  relayCreatorId: string,
  patch: PatchCreatorOnboardingInput
): Promise<CreatorOnboardingReadModel> {
  const creatorId = relayCreatorId.trim();
  if (!creatorId) {
    throw new Error("relayCreatorId required");
  }

  const hasStep = patch.step !== undefined;
  const hasMeta = patch.metadata !== undefined;
  if (!hasStep && !hasMeta) {
    throw new Error("PATCH body must include at least one of: step, metadata");
  }

  if (hasStep && patch.step !== undefined && !isValidOnboardingStep(patch.step)) {
    throw new OnboardingTransitionError("Invalid onboarding step value.", "invalid_step");
  }

  let row = await prisma.creatorOnboardingState.findUnique({
    where: { creatorId },
    select: { step: true, metadata: true, updatedAt: true }
  });
  if (!row) {
    row = await prisma.creatorOnboardingState.create({
      data: { creatorId, step: "connected" },
      select: { step: true, metadata: true, updatedAt: true }
    });
  }

  const targetStep = hasStep ? patch.step! : row.step;
  assertCreatorOnboardingTransition(row.step, targetStep);

  const data: {
    step?: CreatorOnboardingStep;
    metadata?: Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue;
  } = {};
  if (hasStep) {
    data.step = targetStep;
  }
  if (hasMeta) {
    data.metadata =
      patch.metadata === null ? Prisma.DbNull : (patch.metadata as Prisma.InputJsonValue);
  }

  const updated = await prisma.creatorOnboardingState.update({
    where: { creatorId },
    data,
    select: { step: true, metadata: true, updatedAt: true }
  });

  const syncState = await prisma.creatorSyncState.findUnique({
    where: { creatorId },
    select: { lastPostScrape: true }
  });
  const importProgress = parseLastPostScrape(syncState?.lastPostScrape ?? null);

  return {
    creator_id: creatorId,
    step: updated.step,
    metadata: updated.metadata ?? null,
    updated_at: updated.updatedAt.toISOString(),
    import_progress: importProgress
  };
}

export type CreatorOnboardingImportProgress = {
  last_post_scrape_finished_at: string | null;
  last_post_scrape_ok: boolean | null;
  /** From last scrape `apply_result.posts_written` when present. */
  last_post_scrape_posts_written: number | null;
};

export type CreatorOnboardingReadModel = {
  creator_id: string;
  step: CreatorOnboardingStep;
  metadata: unknown | null;
  updated_at: string;
  import_progress: CreatorOnboardingImportProgress | null;
};

function parseLastPostScrape(blob: unknown): CreatorOnboardingImportProgress | null {
  if (blob == null || typeof blob !== "object" || Array.isArray(blob)) {
    return null;
  }
  const o = blob as Record<string, unknown>;
  const finishedAt = typeof o.finished_at === "string" ? o.finished_at : null;
  const ok = typeof o.ok === "boolean" ? o.ok : null;
  let postsWritten: number | null = null;
  const apply = o.apply_result;
  if (apply != null && typeof apply === "object" && !Array.isArray(apply)) {
    const aw = (apply as Record<string, unknown>).posts_written;
    if (typeof aw === "number" && Number.isFinite(aw)) {
      postsWritten = aw;
    }
  }
  if (finishedAt == null && ok == null && postsWritten == null) {
    return null;
  }
  return {
    last_post_scrape_finished_at: finishedAt,
    last_post_scrape_ok: ok,
    last_post_scrape_posts_written: postsWritten
  };
}

/**
 * Ensures a row exists for `relayCreatorId`, loads optional `CreatorSyncState` for import hints.
 */
export async function getCreatorOnboardingForStudio(
  prisma: PrismaClient,
  relayCreatorId: string
): Promise<CreatorOnboardingReadModel> {
  const creatorId = relayCreatorId.trim();
  if (!creatorId) {
    throw new Error("relayCreatorId required");
  }

  const [onboarding, syncState] = await Promise.all([
    prisma.creatorOnboardingState.findUnique({
      where: { creatorId },
      select: { step: true, metadata: true, updatedAt: true }
    }),
    prisma.creatorSyncState.findUnique({
      where: { creatorId },
      select: { lastPostScrape: true }
    })
  ]);

  const row =
    onboarding ??
    (await prisma.creatorOnboardingState.create({
      data: { creatorId, step: "connected" },
      select: { step: true, metadata: true, updatedAt: true }
    }));

  const importProgress = parseLastPostScrape(syncState?.lastPostScrape ?? null);

  return {
    creator_id: creatorId,
    step: row.step,
    metadata: row.metadata ?? null,
    updated_at: row.updatedAt.toISOString(),
    import_progress: importProgress
  };
}
