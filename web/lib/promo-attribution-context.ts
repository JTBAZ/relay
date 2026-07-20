/**
 * Client mirror of server PromoAttributionContextV1.
 * Build only from server-confirmed promo slot rows.
 */

export type PromoAttributionContextV1 = {
  version: 1;
  promo_piece_id: string;
  creator_id: string;
  post_id: string;
  slot_rank: 1 | 2 | 3 | 4 | 5;
  source: "promo_pool";
};

export function buildPromoAttributionContextV1(args: {
  promo_piece_id: string;
  creator_id: string;
  post_id: string;
  slot_rank: number;
}): PromoAttributionContextV1 | null {
  const promo_piece_id = args.promo_piece_id.trim();
  const creator_id = args.creator_id.trim();
  const post_id = args.post_id.trim();
  const rank = Number(args.slot_rank);
  if (!promo_piece_id || !creator_id || !post_id) return null;
  if (!Number.isInteger(rank) || rank < 1 || rank > 5) return null;
  return {
    version: 1,
    promo_piece_id,
    creator_id,
    post_id,
    slot_rank: rank as 1 | 2 | 3 | 4 | 5,
    source: "promo_pool"
  };
}
