"use client";

import Link from "next/link";

export type PatronEmptyFeedStateProps =
  | {
      variant: "filter_mismatch";
      onShowAll: () => void;
      testId?: string;
    }
  | {
      variant: "live_oauth" | "live_no_follows" | "live_no_posts";
      testId?: string;
    }
  | {
      variant: "fixtures_empty";
      testId?: string;
    };

export function PatronEmptyFeedState(props: PatronEmptyFeedStateProps) {
  const tid =
    props.testId ??
    (props.variant === "filter_mismatch"
      ? "patron-empty-feed-filter"
      : props.variant === "live_oauth"
        ? "patron-empty-feed-oauth"
        : props.variant === "live_no_follows"
          ? "patron-empty-feed-no-follows"
          : props.variant === "live_no_posts"
            ? "patron-empty-feed-no-posts"
            : "patron-empty-feed-fixtures");

  if (props.variant === "filter_mismatch") {
    return (
      <div
        data-testid={tid}
        className="flex flex-col items-center gap-3 py-20 text-center max-w-md mx-auto"
      >
        <p className="text-sm text-[#5A5A5A]">No posts match this filter.</p>
        <button
          type="button"
          onClick={props.onShowAll}
          className="mt-2 text-sm text-[#2D6A4F] hover:text-[#40916C] transition-colors duration-150"
        >
          Show all posts
        </button>
      </div>
    );
  }

  if (props.variant === "fixtures_empty") {
    return (
      <div
        data-testid={tid}
        className="flex flex-col items-center gap-3 py-20 text-center max-w-md mx-auto"
      >
        <p className="text-sm text-[#5A5A5A]">No posts match this filter.</p>
      </div>
    );
  }

  if (props.variant === "live_oauth") {
    return (
      <div
        data-testid={tid}
        className="flex flex-col items-center gap-3 py-20 text-center max-w-md mx-auto"
      >
        <p className="text-sm text-[#5A5A5A]">
          <span className="font-medium text-[#A1A1AA]">Connect Patreon</span> to load your home feed.
          Linking lets Relay see who you support and unlock posts you&apos;re allowed to view.
        </p>
        <p className="text-xs text-[#4B5563]">
          After you connect, follow creators on Relay to see them here.
        </p>
        <Link
          href="/patreon/patron/connect"
          className="text-sm font-medium text-[#2D6A4F] hover:text-[#40916C] transition-colors"
        >
          Continue to Patreon
        </Link>
      </div>
    );
  }

  if (props.variant === "live_no_follows") {
    return (
      <div
        data-testid={tid}
        className="flex flex-col items-center gap-3 py-20 text-center max-w-md mx-auto"
      >
        <p className="text-sm text-[#5A5A5A]">
          You&apos;re{' '}
          <span className="font-medium text-[#A1A1AA]">not following anyone</span> on Relay yet. Posts
          from creators you follow will show up here.
        </p>
        <p className="text-xs text-[#4B5563]">
          Browse Discover to find people, or open your Following list from the sidebar once you follow
          someone.
        </p>
        <Link
          href="/patron/discover"
          className="text-sm font-medium text-[#2D6A4F] hover:text-[#40916C] transition-colors"
        >
          Go to Discover
        </Link>
      </div>
    );
  }

  return (
    <div
      data-testid={tid}
      className="flex flex-col items-center gap-3 py-20 text-center max-w-md mx-auto"
    >
      <p className="text-sm text-[#5A5A5A]">
        <span className="font-medium text-[#A1A1AA]">No posts yet</span> from people you follow. They
        may not have published on Relay, or your membership may not include their latest work.
      </p>
      <p className="text-xs text-[#4B5563]">
        If something looks wrong, reconnect Patreon from settings to refresh your tier access.
      </p>
      <Link
        href="/patreon/patron/connect"
        className="text-sm font-medium text-[#2D6A4F] hover:text-[#40916C] transition-colors"
      >
        Reconnect Patreon
      </Link>
    </div>
  );
}
