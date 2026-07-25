import type { Metadata } from "next";
import { Suspense } from "react";
import { ScheduledPostReviewClient } from "./scheduled-post-review-client";

export const metadata: Metadata = {
  title: "Relay — Review scheduled post",
  description: "Review and send a scheduled post from the Schedule Rail."
};

export default function ScheduledPostReviewPage() {
  return (
    <Suspense fallback={null}>
      <ScheduledPostReviewClient />
    </Suspense>
  );
}
