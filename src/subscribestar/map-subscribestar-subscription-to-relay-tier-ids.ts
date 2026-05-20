/**
 * Maps SubscribeStar subscriber GraphQL `data` JSON to Relay tier ids matching ingest (`substar_tier_{external}`).
 *
 * **Explorer note:** Provider documents vary; this module walks common connection shapes and matches
 * subscriptions whose `subscribeable` / `creator` / `profile` id equals the creator's
 * `CreatorProfile.subscribestarProfileId`. Tier keys tried on each node: `plan.id`, `plan.tierId`,
 * `pricingPlan.id`, `tier.id`, `tierId`, `reward.id`.
 *
 * @see ./map-subscribestar-to-ingest.js `substarTierId`
 */

import { substarTierId } from "./map-subscribestar-to-ingest.js";

export type SubscribeStarPatronTierMapFilter = {
  /** Creator's SubscribeStar profile id from `CreatorProfile.subscribestarProfileId`. */
  creatorSubscribeStarProfileId: string;
};

const TIER_KEY_PATHS = [
  ["plan", "id"],
  ["plan", "tierId"],
  ["pricingPlan", "id"],
  ["tier", "id"],
  ["reward", "id"]
] as const;

/** Profile id keys tried on subscription nodes (hypothesis / Explorer-dependent). */
const SUBSCRIBEABLE_PATHS = [
  ["subscribeable", "id"],
  ["creator", "id"],
  ["profile", "id"],
  ["contentCreator", "id"],
  ["user", "id"]
] as const;

function getNested(obj: unknown, path: readonly string[]): unknown {
  let cur: unknown = obj;
  for (const k of path) {
    if (cur === null || cur === undefined || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[k];
  }
  return cur;
}

function isActiveishStatus(status: unknown): boolean {
  if (typeof status !== "string") return true;
  const s = status.toLowerCase();
  if (s.includes("cancel")) return false;
  return s === "active" || s === "paid" || s === "trialing" || s === "" || s === "authenticated";
}

function collectEdgesArrays(root: unknown, out: unknown[][]): void {
  if (root === null || root === undefined) return;
  if (Array.isArray(root)) {
    for (const item of root) collectEdgesArrays(item, out);
    return;
  }
  if (typeof root !== "object") return;
  const o = root as Record<string, unknown>;
  if (Array.isArray(o.nodes)) {
    for (const node of o.nodes as unknown[]) {
      if (node !== undefined && node !== null) out.push([node]);
    }
  }
  if (Array.isArray(o.edges)) {
    for (const e of o.edges as unknown[]) {
      if (e && typeof e === "object" && "node" in (e as object)) {
        const node = (e as { node?: unknown }).node;
        if (node !== undefined && node !== null) {
          if (Array.isArray(node)) {
            for (const n of node) out.push([n]);
          } else {
            out.push([node]);
          }
        }
      }
    }
  }
  for (const v of Object.values(o)) {
    collectEdgesArrays(v, out);
  }
}

function normalizeTierExternalId(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  return raw.trim();
}

/**
 * Extract `substar_tier_*` ids from GraphQL `data` root for subscriptions targeting a creator profile.
 */
export function mapSubscribeStarPatronSubscriptionDataToRelayTierIds(
  graphqlDataRoot: unknown,
  filter: SubscribeStarPatronTierMapFilter
): string[] {
  const want = filter.creatorSubscribeStarProfileId.trim();
  if (!want) return [];

  const edgeNodes: unknown[][] = [];
  collectEdgesArrays(graphqlDataRoot, edgeNodes);

  const seen = new Set<string>();
  const out: string[] = [];

  const nodes: unknown[] = [];
  for (const arr of edgeNodes) {
    for (const n of arr) nodes.push(n);
  }

  for (const node of nodes) {
    if (node === null || node === undefined || typeof node !== "object") continue;
    const n = node as Record<string, unknown>;

    const st = n.status ?? n.state;
    if (!isActiveishStatus(st)) continue;

    let matchesCreator = false;
    for (const path of SUBSCRIBEABLE_PATHS) {
      const id = getNested(n, path);
      if (typeof id === "string" && id.trim() === want) {
        matchesCreator = true;
        break;
      }
    }
    if (!matchesCreator) continue;

    let tierExt: string | null = null;
    for (const path of TIER_KEY_PATHS) {
      const raw = getNested(n, path);
      tierExt = normalizeTierExternalId(raw);
      if (tierExt) break;
    }
    if (!tierExt && typeof n.id === "string" && n.id.includes("tier")) {
      tierExt = normalizeTierExternalId(n.id);
    }
    if (!tierExt) continue;

    const relayId = substarTierId(tierExt);
    if (!seen.has(relayId)) {
      seen.add(relayId);
      out.push(relayId);
    }
  }

  return out;
}
