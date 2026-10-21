import type { PatreonChangeWork } from "@prisma/client";
import { PatreonChangeWorkStore } from "./patreon-change-work.js";

/** DB receipts own retry timing; repeatable BullMQ ticks recover every uncompleted lease after restart. */
export async function processPatreonChanges(store: PatreonChangeWorkStore, execute: (row: PatreonChangeWork) => Promise<void>, workId?: string): Promise<void> {
  await store.retain();
  const ids = workId ? [workId] : await store.dueIds();
  const outcomes = await Promise.allSettled(ids.map(async (id) => {
    const row = await store.claim(id);
    if (!row) return;
    let leaseError = false;
    const heartbeat = setInterval(() => { void store.heartbeat(row).catch(() => { leaseError = true; }); }, 15_000);
    try {
      await execute(row);
      if (leaseError) throw new Error("Patreon change lease interrupted.");
      await store.finish(row);
    } catch (error) {
      const delay = (error as { retryAfterMs?: unknown } | null)?.retryAfterMs;
      await store.finish(row, { retryAfterMs: typeof delay === "number" && Number.isFinite(delay) && delay >= 0 ? delay : undefined });
      throw new Error("Patreon change work failed; durable retry state retained.");
    } finally { clearInterval(heartbeat); }
  }));
  if (outcomes.some((r) => r.status === "rejected")) throw new Error("Patreon change work requires retry; inspect durable work state.");
}
