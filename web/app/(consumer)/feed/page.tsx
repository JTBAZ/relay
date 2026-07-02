import { RelayApp } from "@/components/patron/relay/relay-app";
import {
  PatronFeedDevPreviewClient,
  type FeedDevState
} from "./PatronFeedDevPreviewClient";

const DEV_STATES = new Set<FeedDevState>([
  "mixed",
  "empty",
  "loading",
  "error",
  "moderating",
  "auto_mod_blocked"
]);

function devToolsEnabled(): boolean {
  return (
    (process.env.NEXT_PUBLIC_RELAY_PATRON_FEED_DEV_TOOLS ?? "")
      .toString()
      .toLowerCase() === "true"
  );
}

interface PatronFeedPageProps {
  searchParams?: Record<string, string | string[] | undefined>;
}

/**
 * Production: render the full `<RelayApp />` (auth-gated by middleware).
 *
 * Dev preview: when `NEXT_PUBLIC_RELAY_PATRON_FEED_DEV_TOOLS=true` and `?state=...` is one of
 * the recognised dev states, render the `<PatronFeedDevPreviewClient />` instead. Middleware
 * also has a sibling carve-out so the dev preview is reachable without a `relay_session` cookie.
 */
export default function PatronFeedPage({ searchParams = {} }: PatronFeedPageProps) {
  const raw = searchParams.state;
  const requested = Array.isArray(raw) ? raw[0] : raw;
  if (
    devToolsEnabled() &&
    typeof requested === "string" &&
    DEV_STATES.has(requested as FeedDevState)
  ) {
    return <PatronFeedDevPreviewClient state={requested as FeedDevState} />;
  }
  return <RelayApp />;
}
