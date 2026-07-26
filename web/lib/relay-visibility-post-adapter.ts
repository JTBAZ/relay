/**
 * Single-post Layer C adapter for Audience & Promotion.
 * Always plans writes against every gallery row for the post (not only the focused thumb).
 */

import {
  buildGalleryVisibilityBody,
  bucketItemsByVisibilityAfterAction,
  type GalleryItem,
  type PostVisibility,
  type VisibilityAxisAction
} from "@/lib/relay-api";
import {
  visibilityItemsTriState,
  type VisibilityToggleTriState
} from "@/lib/visibility-toggle-state";

export type PostVisibilitySwitchState = {
  hidden: VisibilityToggleTriState;
  mature: VisibilityToggleTriState;
  /** Adult axis blocked while every asset is hidden (Bulk parity). */
  matureDisabled: boolean;
  allHidden: boolean;
};

export function postVisibilitySwitchState(postItems: GalleryItem[]): PostVisibilitySwitchState {
  const hidden = visibilityItemsTriState(postItems, (v) => v === "hidden");
  const mature = visibilityItemsTriState(postItems, (v) => v === "review");
  const allHidden = hidden === "on";
  return {
    hidden,
    mature,
    allHidden,
    matureDisabled: allHidden
  };
}

export type PostVisibilityAxisPlan = {
  action: VisibilityAxisAction;
  /** One POST body per resulting visibility bucket (same shape as Bulk). */
  requests: Array<{
    visibility: PostVisibility;
    body: ReturnType<typeof buildGalleryVisibilityBody>;
    itemCount: number;
  }>;
  /** Distinct media/post targets covered (for tests). */
  coveredMediaIds: string[];
  coveredPostIds: string[];
};

/**
 * Plan Hidden/Adult axis writes for an entire post's `postItems`.
 * Does not fetch — caller POSTs each `requests[].body` to `/api/v1/gallery/visibility`.
 */
export function planPostVisibilityAxisWrite(
  creatorId: string,
  postItems: GalleryItem[],
  action: VisibilityAxisAction
): PostVisibilityAxisPlan {
  const buckets = bucketItemsByVisibilityAfterAction(postItems, action);
  const requests: PostVisibilityAxisPlan["requests"] = [];
  for (const [visibility, group] of Array.from(buckets.entries())) {
    if (group.length === 0) continue;
    requests.push({
      visibility,
      body: buildGalleryVisibilityBody(creatorId, group, visibility),
      itemCount: group.length
    });
  }
  return {
    action,
    requests,
    coveredMediaIds: postItems.map((i) => i.media_id),
    coveredPostIds: Array.from(new Set(postItems.map((i) => i.post_id)))
  };
}

export function axisActionFromHiddenToggle(nextOn: boolean): VisibilityAxisAction {
  return nextOn ? "set_hidden" : "set_visible";
}

export function axisActionFromMatureToggle(nextOn: boolean): VisibilityAxisAction {
  return nextOn ? "set_mature" : "set_general";
}
