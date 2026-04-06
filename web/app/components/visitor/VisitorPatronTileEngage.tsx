"use client";

import { Star } from "lucide-react";
import SnipIcon from "@/app/components/icons/SnipIcon";

export type VisitorPatronTileStarProps = {
  patronAuthed: boolean;
  active: boolean;
  onToggle: () => void;
};

export type VisitorPatronTileSnipProps = {
  patronAuthed: boolean;
  snippedMediaIds: Set<string>;
  onSnipRequest: (postId: string, mediaId: string) => void;
};

/** Same callbacks as `VisitorGalleryView`’s `visitorEngagement` — star is post-level, snip is per media. */
export type VisitorPatronEngagementCallbacks = {
  patronAuthed: boolean;
  isPostFavorited: (postId: string) => boolean;
  onTogglePostStar: (postId: string, favorited: boolean) => void;
  snippedMediaIds: Set<string>;
  onSnipRequest: (postId: string, mediaId: string) => void;
};

export function visitorPatronStarSnipFromEngagement(
  postId: string,
  engagement: VisitorPatronEngagementCallbacks
): {
  visitorPatronStar: VisitorPatronTileStarProps;
  visitorPatronSnip: VisitorPatronTileSnipProps;
} {
  return {
    visitorPatronStar: {
      patronAuthed: engagement.patronAuthed,
      active: engagement.isPostFavorited(postId),
      onToggle: () =>
        engagement.onTogglePostStar(postId, !engagement.isPostFavorited(postId))
    },
    visitorPatronSnip: {
      patronAuthed: engagement.patronAuthed,
      snippedMediaIds: engagement.snippedMediaIds,
      onSnipRequest: engagement.onSnipRequest
    }
  };
}

export function visitorPatronSnipButtonClass(active: boolean): string {
  return `shrink-0 rounded-full border border-[var(--lib-border)] bg-black/55 p-1.5 shadow-md backdrop-blur-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lib-selection)] ${
    active
      ? "text-[var(--lib-selection)]"
      : "text-[oklch(0.42_0.07_155)] hover:bg-black/75 hover:text-[oklch(0.52_0.09_155)]"
  }`;
}

export function visitorPatronEngageRevealWrap(forceVisible: boolean): string {
  return forceVisible
    ? "opacity-100"
    : "opacity-0 transition-opacity duration-200 [pointer:coarse]:opacity-50 [@media(hover:hover)]:group-hover:opacity-60 group-focus-within:opacity-60";
}

export const visitorPatronEngageRevealBtn =
  "[@media(hover:hover)]:hover:opacity-100 focus-visible:opacity-100";

type ClusterProps = {
  postId: string;
  currentMediaId: string;
  visitorPatronStar?: VisitorPatronTileStarProps;
  visitorPatronSnip?: VisitorPatronTileSnipProps;
  className?: string;
};

/** Snip (per media) + star (whole post), aligned with `PostBatchGridCell` visitor affordances. */
export function VisitorPatronTileEngageCluster({
  postId,
  currentMediaId,
  visitorPatronStar,
  visitorPatronSnip,
  className = ""
}: ClusterProps) {
  const showSnip = Boolean(visitorPatronSnip);
  const showStar = Boolean(visitorPatronStar);
  if (!showSnip && !showStar) return null;

  const snipActive = visitorPatronSnip?.snippedMediaIds.has(currentMediaId) ?? false;
  const starActive = visitorPatronStar?.active ?? false;
  const snipEngageAuthed = visitorPatronSnip?.patronAuthed ?? false;
  const starEngageAuthed = visitorPatronStar?.patronAuthed ?? false;

  return (
    <div
      className={`pointer-events-auto flex items-center gap-1 ${visitorPatronEngageRevealWrap(snipActive || starActive)} ${className}`}
    >
      {showSnip ? (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            visitorPatronSnip!.onSnipRequest(postId, currentMediaId);
          }}
          className={`${visitorPatronSnipButtonClass(snipActive)} ${visitorPatronEngageRevealBtn}`}
          aria-label={
            snipEngageAuthed
              ? snipActive
                ? "Snipped — add to another collection or manage in Saved"
                : "Snip current image to a collection"
              : "Sign in with Patreon to snip the current asset to a collection"
          }
          aria-pressed={snipEngageAuthed ? snipActive : undefined}
        >
          <SnipIcon className="h-4 w-4" />
        </button>
      ) : null}
      {showStar ? (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            visitorPatronStar!.onToggle();
          }}
          className={`shrink-0 rounded-full border border-[var(--lib-border)] bg-[var(--lib-muted)]/90 p-1.5 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lib-selection)] ${visitorPatronEngageRevealBtn} ${
            visitorPatronStar!.active
              ? "border-[color-mix(in_srgb,var(--lib-selection)_50%,var(--lib-border))] text-[var(--lib-selection)]"
              : "text-[var(--lib-fg-muted)] hover:text-[var(--lib-fg)]"
          }`}
          aria-label={
            starEngageAuthed
              ? visitorPatronStar!.active
                ? "Remove entire post from favorites"
                : "Favorite entire post"
              : "Sign in with Patreon to favorite this whole post"
          }
          aria-pressed={starEngageAuthed ? visitorPatronStar!.active : undefined}
        >
          <Star
            className="h-4 w-4"
            fill={visitorPatronStar!.active ? "currentColor" : "none"}
            strokeWidth={2}
          />
        </button>
      ) : null}
    </div>
  );
}
