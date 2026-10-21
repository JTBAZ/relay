import { randomUUID } from "node:crypto";
export type PostScanLane = "archive" | "catchup";
export type PostScan = { passId: string; next: string | null; status: "unknown" | "partial" | "complete"; candidate: string | null; pages: number; due: number; seen: string[]; verifiedAt?: string };
export type PostSyncProgress = { version: 1; turn: number; archive: PostScan; catchup: PostScan; reconcile: { after: string | null; due: number } };
export type PostSyncLease = { creatorId: string; campaignId: string; token: string; version: number; progress: PostSyncProgress };
export type PostSyncCheckpoint = { lease: PostSyncLease; progress: PostSyncProgress; watermark?: string };
export const POST_SYNC_LEASE_MS = 120_000;
export function emptyPostSyncProgress(): PostSyncProgress {
  const scan = (): PostScan => ({ passId: randomUUID(), next: null, status: "unknown", candidate: null, pages: 0, due: 0, seen: [] });
  return { version: 1, turn: 0, archive: scan(), catchup: scan(), reconcile: { after: null, due: 0 } };
}
export function readPostSyncProgress(value: unknown): PostSyncProgress {
  if (value == null) return emptyPostSyncProgress();
  const p = value as PostSyncProgress;
  if (p.version !== 1 || (!Number.isSafeInteger(p.turn) || p.turn < 0) || !p.archive || !p.catchup || !p.reconcile) throw new Error("Invalid Patreon post progress.");
  for (const scan of [p.archive, p.catchup]) {
    if (typeof scan.passId !== "string" || !/^[a-f0-9-]{36}$/.test(scan.passId) || !["unknown", "partial", "complete"].includes(scan.status) || (scan.next !== null && (typeof scan.next !== "string" || scan.next.length > 8192)) || (!Number.isSafeInteger(scan.pages) || scan.pages < 0) || (!Number.isFinite(scan.due) || scan.due < 0) || (scan.candidate !== null && (typeof scan.candidate !== "string" || !Number.isFinite(Date.parse(scan.candidate)))) || (scan.status === "partial" && !scan.next) || (scan.status === "complete" && scan.next !== null) || !Array.isArray(scan.seen) || scan.seen.length > 2 || scan.seen.some((s) => typeof s !== "string" || s.length > 8192)) throw new Error("Invalid Patreon page progress.");
  }
  if ((p.reconcile.after !== null && typeof p.reconcile.after !== "string") || (!Number.isFinite(p.reconcile.due) || p.reconcile.due < 0)) throw new Error("Invalid Patreon reconciliation progress.");
  return structuredClone(p);
}
export interface PatreonPostProgressStore {
  readonly shared: boolean;
  get(creatorId: string, campaignId: string): Promise<PostSyncProgress | null>;
  claim(creatorId: string, campaignId: string): Promise<PostSyncLease | null>;
  checkpoint(command: PostSyncCheckpoint): Promise<void>;
  heartbeat(lease: PostSyncLease): Promise<void>;
  release(lease: PostSyncLease): Promise<void>;
  selectCreators(ids: string[], cap: number): Promise<string[]>;
}
