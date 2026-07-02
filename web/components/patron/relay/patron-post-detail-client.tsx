"use client";

import { useEffect, useMemo, useState } from "react";
import { notFound, useRouter } from "next/navigation";
import { GalleryView } from "./gallery-view";
import { PatronPostEntitlementStrip } from "./patron-post-entitlement-strip";
import {
  fetchGalleryPostDetail,
  fetchPatronSessionMe,
  RelayApiError,
  type GalleryPostDetail,
  type PatronSessionMe,
} from "@/lib/relay-api";
import type { FeedPost } from "@/lib/relay-fixtures";
import {
  galleryPostDetailToPatronFeedPost,
  stubCreatorFromRelayId,
} from "@/lib/patron-post-detail-mapper";
import { emitPatronFeedTelemetryEvent } from "@/lib/patron-feed-telemetry";

export interface PatronPostDetailClientProps {
  creatorId: string;
  postId: string;
  initialMediaId?: string;
  initialIntent?: "comment" | "snip";
}

export function PatronPostDetailClient({
  creatorId,
  postId,
  initialMediaId,
  initialIntent,
}: PatronPostDetailClientProps) {
  const router = useRouter();
  const [detail, setDetail] = useState<GalleryPostDetail | null>(null);
  const [feedPost, setFeedPost] = useState<FeedPost | null>(null);
  const [sessionMe, setSessionMe] = useState<PatronSessionMe | null>(null);
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    setPhase("loading");
    setDetail(null);
    setFeedPost(null);

    void fetchPatronSessionMe()
      .then((s) => {
        if (!cancelled) setSessionMe(s);
      })
      .catch(() => {
        if (!cancelled) setSessionMe(null);
      });

    void fetchGalleryPostDetail(creatorId, postId, { visitor: true })
      .then((d) => {
        if (cancelled) return;
        setDetail(d);
        const creator = stubCreatorFromRelayId(creatorId);
        setFeedPost(galleryPostDetailToPatronFeedPost(creatorId, d, creator));
        setPhase("ready");
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        if (e instanceof RelayApiError && e.status === 404) {
          notFound();
          return;
        }
        setPhase("error");
      });

    return () => {
      cancelled = true;
    };
  }, [creatorId, postId]);

  useEffect(() => {
    if (phase !== "ready" || !detail) return;
    emitPatronFeedTelemetryEvent({
      event_name: "post_view",
      actor_key: sessionMe?.user_id,
      creator_id: creatorId,
      post_id: postId,
      surface: "patron_feed_post_detail"
    });
  }, [phase, detail, sessionMe, creatorId, postId]);

  const liveCommentsScope = useMemo(() => {
    if (!sessionMe) return null;
    return {
      relayCreatorId: creatorId,
      postId,
      viewerAccountId: sessionMe.user_id ?? null,
      isCreatorOwner: Boolean(
        sessionMe.creator_id?.trim() && sessionMe.creator_id.trim() === creatorId.trim()
      )
    };
  }, [creatorId, postId, sessionMe]);

  if (phase === "loading" || !feedPost || !detail) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#0A0A0A] px-6">
        <p className="text-sm text-[#5A5A5A]">Loading post…</p>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#0A0A0A] px-6 text-center">
        <p className="text-sm font-medium text-[#E5E7EB] mb-2">Could not load this post</p>
        <p className="text-xs text-[#6B7280] mb-6 max-w-md">
          Check your connection or try again. If you should have access, reconnect Patreon from
          settings.
        </p>
        <a
          href="/feed"
          className="text-sm font-medium text-[#2D6A4F] hover:text-[#40916C] transition-colors"
        >
          Back to feed
        </a>
      </div>
    );
  }

  return (
    <GalleryView
      post={feedPost}
      initialMediaId={initialMediaId}
      initialIntent={initialIntent}
      onClose={() => {
        if (typeof window !== "undefined" && window.history.length > 1) {
          router.back();
        } else {
          router.push("/feed");
        }
      }}
      entitlementStrip={<PatronPostEntitlementStrip tiers={detail.tiers} />}
      liveCommentsScope={liveCommentsScope}
    />
  );
}
