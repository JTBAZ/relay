import {
  expandAllPatronsTierIds,
  hasCampaignPatreonTierRows,
  listCampaignPaidPatreonTierIds
} from "../patreon/expand-all-patrons-tiers.js";
import { RELAY_TIER_ALL_PATRONS } from "../patreon/relay-access-tiers.js";
import type { SyncBatchInput } from "./types.js";

export type EnrichBatchResult = {
  batch: SyncBatchInput;
  notes: string[];
};

/**
 * Pre-apply ingest rules: expands `relay_tier_all_patrons` to concrete `patreon_tier_*`
 * ids when the batch includes a campaign tier catalog (see `expand-all-patrons-tiers.ts`).
 */
export function enrichBatch(batch: SyncBatchInput): EnrichBatchResult {
  const notes: string[] = [];
  const posts = batch.posts;
  if (!posts?.length) {
    return { batch, notes };
  }

  const paidTierIds = listCampaignPaidPatreonTierIds(batch.tiers);
  const anyPatreonCatalog = hasCampaignPatreonTierRows(batch.tiers);
  let expanded = 0;
  for (const p of posts) {
    const before = p.tier_ids;
    const after = expandAllPatronsTierIds(before, paidTierIds);
    const changed =
      after.length !== before.length || after.some((t, i) => t !== before[i]);
    if (changed) {
      p.tier_ids = after;
      p.upstream_revision = `${p.upstream_revision}:tier_expand`;
      expanded += 1;
    }
  }

  if (expanded > 0) {
    notes.push(
      `Tier normalize: expanded relay_tier_all_patrons on ${expanded} post(s) to ${paidTierIds.length} paid Patreon tier id(s).`
    );
  }
  if (paidTierIds.length === 0) {
    const k = posts.filter(
      (p) => p.tier_ids.length === 1 && p.tier_ids[0] === RELAY_TIER_ALL_PATRONS
    ).length;
    if (k > 0) {
      if (anyPatreonCatalog) {
        notes.push(
          `Tier normalize: no expansion (${k} post(s) still all_patrons; no paid tiers with amount_cents>0 in batch tier catalog).`
        );
      } else {
        notes.push(
          `Tier normalize: no expansion (${k} post(s) still all_patrons; no patreon_tier_* in batch tiers).`
        );
      }
    }
  }

  return { batch, notes };
}
