/**
 * Optional background cadence for SubscribeStar GraphQL → ingest (BullMQ repeat + in-process timer).
 */

import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type { SubscribeStarCreatorAuthService } from "../auth/subscribestar-auth-service.js";
import type { IngestService } from "../ingest/ingest-service.js";
import { recordSubscribeStarLastPostSync } from "./record-subscribestar-provider-sync.js";
import { runSubscribeStarPostsGraphqlPagedIngest } from "./run-subscribestar-posts-graphql-ingest.js";
import { subscribeStarPostsPageGraphqlQueryFromEnv } from "./subscribestar-ingest-queries.js";

function envTruthy(raw: string | undefined): boolean {
  if (!raw) return false;
  const v = raw.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

const MIN_REPEAT_MS = 600_000;

/**
 * When set (≥ 10 minutes) with ingest flag + configured posts query, API registers BullMQ repeat
 * (`subscribestar_graphql_posts_ingest`).
 */
export function subscribeStarGraphqlIngestAutosyncRepeatEveryMsFromEnv(
  env: NodeJS.ProcessEnv = process.env
): number | null {
  if (!envTruthy(env.SUBSCRIBESTAR_INGEST_ENABLED)) return null;
  if (!subscribeStarPostsPageGraphqlQueryFromEnv(env)) return null;
  const raw = env.RELAY_SUBSCRIBESTAR_GRAPHQL_INGEST_MS?.trim();
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < MIN_REPEAT_MS) return null;
  return Math.floor(n);
}

/** Max pages each autosync tick pulls (1–50); defaults to 5 (lighter than interactive sync). */
export function subscribeStarGraphqlAutosyncMaxPagesFromEnv(
  env: NodeJS.ProcessEnv = process.env
): number {
  const raw = env.SUBSCRIBESTAR_GRAPHQL_AUTOSYNC_MAX_PAGES?.trim();
  const n = raw ? Number(raw) : 5;
  if (!Number.isFinite(n) || n < 1) return 5;
  return Math.min(50, Math.floor(n));
}

export type SubscribeStarGraphqlIngestAutosyncDeps = {
  prisma: PrismaClient | null;
  authService: SubscribeStarCreatorAuthService;
  graphqlUrl: string;
  ingestService: IngestService;
  fetchImpl: typeof fetch;
  log?: (msg: string, ctx?: Record<string, unknown>) => void;
};

/**
 * One autosync tick: all creators with SubscribeStar tokens (or one `creatorId` when job-scoped).
 */
export async function runSubscribeStarGraphqlIngestAutosyncOnce(
  deps: SubscribeStarGraphqlIngestAutosyncDeps & { creatorId?: string; env?: NodeJS.ProcessEnv }
): Promise<{ creators_attempted: number; creators_succeeded: number; errors: Array<{ creator_id: string; message: string }> }> {
  const env = deps.env ?? process.env;
  const maxPages = subscribeStarGraphqlAutosyncMaxPagesFromEnv(env);
  const ids = deps.creatorId?.trim()
    ? [deps.creatorId.trim()]
    : await deps.authService.listStoredCreatorIds();

  let succeeded = 0;
  const errors: Array<{ creator_id: string; message: string }> = [];

  for (const cid of ids) {
    const traceId = `substar_autosync_${randomUUID()}`;
    try {
      const outcome = await runSubscribeStarPostsGraphqlPagedIngest({
        creator_id: cid,
        traceId,
        max_pages: maxPages,
        deps: {
          graphqlUrl: deps.graphqlUrl,
          fetchImpl: deps.fetchImpl,
          getAccessToken: () =>
            deps.authService.resolveAccessTokenForGraphqlApi(cid, traceId),
          runBatch: (batch, tid) => deps.ingestService.runBatch(batch, tid)
        }
      });

      const lastApply = outcome.last_apply_result;
      if (deps.prisma && lastApply) {
        try {
          await recordSubscribeStarLastPostSync(deps.prisma, cid, lastApply, traceId);
        } catch (recErr) {
          deps.log?.("subscribestar_autosync: recordSubscribeStarLastPostSync failed (non-fatal)", {
            creator_id: cid,
            err: String(recErr)
          });
        }
      }

      if (outcome.ok) {
        succeeded += 1;
        deps.log?.("subscribestar_autosync: cycle ok", {
          creator_id: cid,
          pages_fetched: outcome.pages_fetched,
          batches_ingested: outcome.batches_ingested,
          ended_reason: outcome.ended_reason
        });
      } else {
        errors.push({ creator_id: cid, message: outcome.issue });
        deps.log?.("subscribestar_autosync: cycle issue", {
          creator_id: cid,
          issue: outcome.issue,
          pages_fetched: outcome.pages_fetched,
          batches_ingested: outcome.batches_ingested
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push({ creator_id: cid, message: msg });
      deps.log?.("subscribestar_autosync: cycle threw", { creator_id: cid, issue: msg });
    }
  }

  return {
    creators_attempted: ids.length,
    creators_succeeded: succeeded,
    errors
  };
}

export type StartSubscribeStarGraphqlIngestAutosyncTimerArgs =
  SubscribeStarGraphqlIngestAutosyncDeps & {
    intervalMs: number;
  };

/** In-process repeat for `RELAY_JOB_BACKEND=memory`. */
export function startSubscribeStarGraphqlIngestAutosyncTimer(
  args: StartSubscribeStarGraphqlIngestAutosyncTimerArgs
): () => void {
  const tick = () => {
    void runSubscribeStarGraphqlIngestAutosyncOnce(args).catch((e) =>
      args.log?.("subscribestar_autosync: timer tick failed", { err: String(e) })
    );
  };
  const id = setInterval(tick, args.intervalMs);
  return () => clearInterval(id);
}
