import type { PostVisibility } from "@/lib/relay-api";

export type VisibilityToggleTriState = "off" | "on" | "mixed";

/** Aggregate selected/post rows for a Layer C axis (Bulk + Hero Access). */
export function visibilityItemsTriState(
  items: { visibility: PostVisibility }[],
  match: (v: PostVisibility) => boolean
): VisibilityToggleTriState {
  if (items.length === 0) return "off";
  const hits = items.filter((i) => match(i.visibility)).length;
  if (hits === 0) return "off";
  if (hits === items.length) return "on";
  return "mixed";
}
