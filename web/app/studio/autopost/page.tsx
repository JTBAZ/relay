import type { Metadata } from "next";
import { Suspense } from "react";
import { AutopostPageClient } from "./autopost-page-client";

export const metadata: Metadata = {
  title: "Relay Autopost — Draft Variants",
  description: "Turn staged media into a Relay post and optimized cross-post drafts."
};

export default function AutopostPage() {
  return (
    <Suspense fallback={null}>
      <AutopostPageClient />
    </Suspense>
  );
}
