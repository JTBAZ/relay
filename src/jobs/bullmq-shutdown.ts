/**
 * Bounded BullMQ worker shutdown (Phase P1-queue-013).
 * @see https://docs.bullmq.io/guide/workers/graceful-shutdown
 */

const DEFAULT_WORKER_CLOSE_GRACE_MS = 30_000;
const MIN_WORKER_CLOSE_GRACE_MS = 1000;
const MAX_WORKER_CLOSE_GRACE_MS = 600_000;

export type RelayBullMqWorkersClose = (opts?: { force?: boolean }) => Promise<void>;

class BullMqWorkerCloseGraceTimeoutError extends Error {
  override name = "BullMqWorkerCloseGraceTimeoutError";
  constructor(readonly graceMs: number) {
    super(`BullMQ worker close exceeded ${graceMs}ms`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Max time to wait for in-flight jobs before `Worker.close(true)` (see `RELAY_BULLMQ_WORKER_CLOSE_GRACE_MS`).
 */
export function relayBullMqWorkerCloseGraceMsFromEnv(
  env: NodeJS.ProcessEnv = process.env
): number {
  const raw = env.RELAY_BULLMQ_WORKER_CLOSE_GRACE_MS?.trim();
  if (!raw) return DEFAULT_WORKER_CLOSE_GRACE_MS;
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_WORKER_CLOSE_GRACE_MS;
  return Math.min(
    MAX_WORKER_CLOSE_GRACE_MS,
    Math.max(MIN_WORKER_CLOSE_GRACE_MS, Math.floor(n))
  );
}

/**
 * Calls `close()` (graceful), then `close({ force: true })` if grace elapses.
 */
export async function awaitRelayBullMqWorkersClose(
  close: RelayBullMqWorkersClose | undefined,
  log: (msg: string, ctx?: Record<string, unknown>) => void,
  env: NodeJS.ProcessEnv = process.env
): Promise<void> {
  if (!close) return;

  const graceMs = relayBullMqWorkerCloseGraceMsFromEnv(env);
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new BullMqWorkerCloseGraceTimeoutError(graceMs)),
      graceMs
    );
  });

  try {
    await Promise.race([close(), timeoutPromise]);
  } catch (e) {
    if (e instanceof BullMqWorkerCloseGraceTimeoutError) {
      log("relay-bullmq: worker close grace exceeded; forcing", {
        graceMs: e.graceMs
      });
      await close({ force: true });
      return;
    }
    throw e;
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}
