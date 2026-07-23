/**
 * In-memory entitlement + webhook idempotency store (EH-042 preview).
 * Durable multi-tenant persistence remains open — keeps productionSafe false.
 */

import type { ManagedVerifyBillingRecord } from "./types.js";

export type ManagedVerifyBillingStore = {
  get(siteId: string): ManagedVerifyBillingRecord | null;
  upsert(record: ManagedVerifyBillingRecord): ManagedVerifyBillingRecord;
  /** Returns false if event id already seen (idempotent ack). */
  claimEvent(eventId: string): boolean;
  hasEvent(eventId: string): boolean;
  /** Test helper — does not delete patron link metadata (none stored here). */
  clear(): void;
  list(): ManagedVerifyBillingRecord[];
};

export function createMemoryManagedVerifyBillingStore(): ManagedVerifyBillingStore {
  const bySite = new Map<string, ManagedVerifyBillingRecord>();
  const events = new Set<string>();

  return {
    get(siteId) {
      return bySite.get(siteId) ?? null;
    },
    upsert(record) {
      const next = { ...record };
      bySite.set(record.siteId, next);
      return next;
    },
    claimEvent(eventId) {
      if (events.has(eventId)) return false;
      events.add(eventId);
      return true;
    },
    hasEvent(eventId) {
      return events.has(eventId);
    },
    clear() {
      bySite.clear();
      events.clear();
    },
    list() {
      return [...bySite.values()].map((r) => ({ ...r }));
    }
  };
}
