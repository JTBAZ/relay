import type { PrismaClient } from "@prisma/client";
import {
  computePaceStatus,
  countRelayLibraryStagingMedia,
  countRelayNativePostsInWindow,
  createActivePostingNudgeIfAbsent,
  creatorLocalMonthWindow,
  findCurrentPeriodNudges,
  reconcilePostingGoalNudgeResolution,
  resolvePostingGoalTimezone
} from "./posting-goal-service.js";

export const DEFAULT_POSTING_GOAL_NUDGE_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const MIN_POSTING_GOAL_NUDGE_INTERVAL_MS = 60_000;

export type PostingGoalNudgeCreatorResult = {
  creator_id: string;
  posting_goal_nudge_created: boolean;
  bonus_post_nudge_created: boolean;
};

export type PostingGoalNudgeCycleResult = {
  cycle_started_at: string;
  creators_scanned: number;
  posting_goal_nudges_created: number;
  bonus_post_nudges_created: number;
  creators: PostingGoalNudgeCreatorResult[];
};

export type RunPostingGoalNudgeOnceOptions = {
  creatorId?: string;
  now?: Date;
  log?: (msg: string, ctx?: Record<string, unknown>) => void;
};

export async function processPostingGoalNudgeForCreator(
  prisma: PrismaClient,
  goal: {
    creatorId: string;
    monthlyPostTarget: number;
    bonusNudgesEnabled: boolean;
    timezone: string;
    enabled: boolean;
  },
  now: Date
): Promise<PostingGoalNudgeCreatorResult> {
  const creatorId = goal.creatorId.trim();
  const empty = {
    creator_id: creatorId,
    posting_goal_nudge_created: false,
    bonus_post_nudge_created: false
  };
  if (!goal.enabled || !creatorId) return empty;

  const timeZone = resolvePostingGoalTimezone(goal.timezone);
  const period = creatorLocalMonthWindow(now, timeZone);
  const [postsThisMonth, stagedMediaCount, nudges] = await Promise.all([
    countRelayNativePostsInWindow(prisma, creatorId, period),
    countRelayLibraryStagingMedia(prisma, creatorId),
    findCurrentPeriodNudges(prisma, creatorId, period.key)
  ]);

  let postingGoalNudgeCreated = false;
  let bonusPostNudgeCreated = false;

  const paceStatus = computePaceStatus({
    postsThisMonth,
    monthlyPostTarget: goal.monthlyPostTarget,
    bonusNudgesEnabled: goal.bonusNudgesEnabled,
    stagedMediaCount,
    now,
    timeZone
  });

  const resolvedCount = await reconcilePostingGoalNudgeResolution(prisma, creatorId, {
    periodKey: period.key,
    postsThisMonth,
    monthlyPostTarget: goal.monthlyPostTarget,
    paceStatus
  });
  const nudgesFresh =
    resolvedCount > 0
      ? await findCurrentPeriodNudges(prisma, creatorId, period.key)
      : nudges;

  if (postsThisMonth < goal.monthlyPostTarget) {
    postingGoalNudgeCreated = await createActivePostingNudgeIfAbsent(
      prisma,
      creatorId,
      period.key,
      "posting_goal",
      nudgesFresh,
      now
    );
  }

  if (
    postsThisMonth >= goal.monthlyPostTarget &&
    goal.bonusNudgesEnabled &&
    stagedMediaCount > 0
  ) {
    bonusPostNudgeCreated = await createActivePostingNudgeIfAbsent(
      prisma,
      creatorId,
      period.key,
      "bonus_post",
      nudgesFresh,
      now
    );
  }

  return {
    creator_id: creatorId,
    posting_goal_nudge_created: postingGoalNudgeCreated,
    bonus_post_nudge_created: bonusPostNudgeCreated
  };
}

export async function runPostingGoalNudgeOnce(
  prisma: PrismaClient,
  opts?: RunPostingGoalNudgeOnceOptions
): Promise<PostingGoalNudgeCycleResult> {
  const now = opts?.now ?? new Date();
  const log = opts?.log ?? (() => undefined);
  const creatorFilter = opts?.creatorId?.trim();

  const goals = await prisma.creatorPostingGoal.findMany({
    where: {
      enabled: true,
      ...(creatorFilter ? { creatorId: creatorFilter } : {})
    }
  });

  const creators: PostingGoalNudgeCreatorResult[] = [];
  let postingGoalNudgesCreated = 0;
  let bonusPostNudgesCreated = 0;

  for (const goal of goals) {
    const result = await processPostingGoalNudgeForCreator(prisma, goal, now);
    creators.push(result);
    if (result.posting_goal_nudge_created) postingGoalNudgesCreated += 1;
    if (result.bonus_post_nudge_created) bonusPostNudgesCreated += 1;
  }

  const summary: PostingGoalNudgeCycleResult = {
    cycle_started_at: now.toISOString(),
    creators_scanned: goals.length,
    posting_goal_nudges_created: postingGoalNudgesCreated,
    bonus_post_nudges_created: bonusPostNudgesCreated,
    creators
  };

  log("posting-goal-nudge: cycle complete", summary);
  return summary;
}

export interface PostingGoalNudgeRunner {
  start(): void;
  stop(): Promise<void>;
  processOnce(): Promise<PostingGoalNudgeCycleResult>;
}

export interface InProcessPostingGoalNudgeRunnerOptions {
  prisma: PrismaClient;
  pollIntervalMs?: number;
  log?: (msg: string, ctx?: Record<string, unknown>) => void;
}

export class InProcessPostingGoalNudgeRunner implements PostingGoalNudgeRunner {
  private readonly prisma: PrismaClient;
  private readonly pollIntervalMs: number;
  private readonly log: (msg: string, ctx?: Record<string, unknown>) => void;
  private timer: ReturnType<typeof setInterval> | null = null;
  private inFlight = false;

  public constructor(opts: InProcessPostingGoalNudgeRunnerOptions) {
    this.prisma = opts.prisma;
    this.pollIntervalMs = opts.pollIntervalMs ?? DEFAULT_POSTING_GOAL_NUDGE_INTERVAL_MS;
    this.log = opts.log ?? (() => undefined);
  }

  public start(): void {
    if (this.timer) return;
    void this.processOnce();
    this.timer = setInterval(() => {
      void this.processOnce();
    }, this.pollIntervalMs);
  }

  public async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    while (this.inFlight) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }

  public async processOnce(): Promise<PostingGoalNudgeCycleResult> {
    if (this.inFlight) {
      return {
        cycle_started_at: new Date().toISOString(),
        creators_scanned: 0,
        posting_goal_nudges_created: 0,
        bonus_post_nudges_created: 0,
        creators: []
      };
    }
    this.inFlight = true;
    try {
      return await runPostingGoalNudgeOnce(this.prisma, { log: this.log });
    } finally {
      this.inFlight = false;
    }
  }
}

export function postingGoalNudgeRepeatEveryMsFromEnv(
  env: NodeJS.ProcessEnv = process.env
): number | null {
  const raw = env.RELAY_POSTING_GOAL_NUDGE_MS?.trim();
  if (raw === undefined || raw === "") return DEFAULT_POSTING_GOAL_NUDGE_INTERVAL_MS;
  if (raw === "0") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < MIN_POSTING_GOAL_NUDGE_INTERVAL_MS) return null;
  return Math.floor(n);
}

export function startPostingGoalNudgeWorker(
  prisma: PrismaClient,
  log?: (msg: string, ctx?: Record<string, unknown>) => void
): PostingGoalNudgeRunner {
  const every = postingGoalNudgeRepeatEveryMsFromEnv();
  if (every === null) {
    return {
      start: () => undefined,
      stop: async () => undefined,
      processOnce: async () => ({
        cycle_started_at: new Date().toISOString(),
        creators_scanned: 0,
        posting_goal_nudges_created: 0,
        bonus_post_nudges_created: 0,
        creators: []
      })
    };
  }
  const runner = new InProcessPostingGoalNudgeRunner({
    prisma,
    pollIntervalMs: every,
    log
  });
  runner.start();
  return runner;
}
