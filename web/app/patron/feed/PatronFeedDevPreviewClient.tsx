"use client";

/**
 * PE-E (BO-P2-04) — `/patron/feed?state=...` dev preview.
 *
 * Lets designers and QA inspect the live-wired comment surface (`<GalleryView>` with
 * `liveCommentsScope` set) without an authenticated session or seeded backend rows. Renders a
 * single synthetic feed post with the modal already open and a banner explaining the active
 * state.
 *
 * Gated by middleware: `/patron/feed?state=...` only bypasses the auth redirect when
 * `NEXT_PUBLIC_RELAY_PATRON_FEED_DEV_TOOLS=true` (see web/middleware.ts).
 *
 * Note: the underlying `useLiveComments` hook hits the real API, so for a true offline
 * preview point `NEXT_PUBLIC_RELAY_API_URL` at a local API or a recorded fixture proxy. The
 * banner surfaces this so designers know what they're seeing.
 */

import { useState } from "react";
import { Info } from "lucide-react";
import { GalleryView } from "@/components/patron/relay/gallery-view";
import { FEED_POSTS } from "@/lib/relay-fixtures";
import type { LiveCommentsScope } from "@/components/patron/relay/use-live-comments";

export type FeedDevState =
  | "mixed"
  | "empty"
  | "loading"
  | "error"
  | "moderating"
  | "auto_mod_blocked";

const STATE_DESCRIPTIONS: Record<FeedDevState, string> = {
  mixed: "Normal thread with a mix of comments, reactions, and tags from the live API.",
  empty: "No comments yet on the post — exercises the empty thread state.",
  loading: "API request in flight (refresh manually to see this).",
  error: "API call failed — exercises the error banner + retry affordance.",
  moderating: "Caller is the creator of this post; mod menus + tag-revoke buttons are visible.",
  auto_mod_blocked:
    "Most recent submit was auto-mod blocked; the awaiting-review banner is shown."
};

interface PatronFeedDevPreviewClientProps {
  state: FeedDevState;
}

export function PatronFeedDevPreviewClient({
  state
}: PatronFeedDevPreviewClientProps): React.ReactElement {
  // Pick a synthetic post — first FEED_POSTS row is the writing post; using that keeps the
  // gallery modal layout consistent with what a real patron would see when opening from the feed.
  const post = FEED_POSTS[0];

  // Synthetic creator scope — matches a creator id you control locally; for live-wired demo,
  // a designer can override via NEXT_PUBLIC_RELAY_PATRON_FEED_DEV_CREATOR_ID.
  const relayCreatorId =
    (process.env.NEXT_PUBLIC_RELAY_PATRON_FEED_DEV_CREATOR_ID ?? "").trim() ||
    "dev-fixture-creator";

  const liveScope: LiveCommentsScope = {
    relayCreatorId,
    postId: post.id,
    viewerAccountId: "dev-fixture-viewer",
    isCreatorOwner: state === "moderating"
  };

  const [closed, setClosed] = useState(false);

  return (
    <div className="min-h-screen bg-[#0A0A0A]">
      <div className="px-6 pt-4">
        <div className="mx-auto flex max-w-5xl items-start gap-2 rounded-md border border-[#2A2A2A] bg-[#141414] p-3 text-xs text-[#bbb]">
          <Info size={14} className="mt-0.5 shrink-0 text-[#40916C]" aria-hidden />
          <div>
            <div className="mb-0.5 font-medium text-[#E0E0E0]">
              Dev preview: <code className="text-[#9bf0c4]">?state={state}</code>
            </div>
            <div>{STATE_DESCRIPTIONS[state]}</div>
            <div className="mt-1 text-[10px] text-[#666]">
              Live API target: <code>{process.env.NEXT_PUBLIC_RELAY_API_URL ?? "http://127.0.0.1:8787"}</code>
              {" · "}
              <a className="underline-offset-2 hover:underline" href="/patron/feed">
                exit preview
              </a>
            </div>
          </div>
        </div>
      </div>

      {!closed ? (
        <GalleryView
          post={post}
          onClose={() => setClosed(true)}
          liveCommentsScope={liveScope}
        />
      ) : (
        <div className="px-6 py-12 text-center text-xs text-[#666]">
          Preview closed.{" "}
          <button onClick={() => setClosed(false)} className="text-[#bbb] underline-offset-2 hover:underline">
            Reopen modal
          </button>
        </div>
      )}
    </div>
  );
}
