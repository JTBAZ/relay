/**
 * Tip eligibility reason copy (MB-7) — keep in sync with `src/tips/tip-eligibility.ts`.
 */
export type TipEligibilityReason =
  | "not_in_promo_pool"
  | "mature"
  | "storefront"
  | "disabled"
  | "already_entitled";

export function tipEligibilityReasonCopy(reason: TipEligibilityReason): string {
  switch (reason) {
    case "mature":
      return "Rated 18+ — not eligible for Tips";
    case "storefront":
      return "Listed in a storefront — not eligible for Tips";
    case "disabled":
      return "You've turned Tips off for this piece";
    case "already_entitled":
      return "Already free to viewers — Tips not needed";
    case "not_in_promo_pool":
      return "Not in the Promo Pool";
    default:
      return "Not eligible for Tips";
  }
}
