import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ScheduledPostStep2DevClient } from "./scheduled-post-step2-dev-client";

export const metadata: Metadata = {
  title: "Relay Dev — Step 2 Prepare platforms",
  description: "Safe redesign playground for scheduled-post Transform & route."
};

export default function ScheduledPostStep2DevPage() {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.NEXT_PUBLIC_RELAY_SHOW_DEV_BENCH !== "true"
  ) {
    notFound();
  }

  return (
    <Suspense
      fallback={
        <div className="min-h-[100dvh] bg-[#050706] px-4 py-16 text-center text-sm text-[#3a4a3e]">
          Loading Step 2 dev clone…
        </div>
      }
    >
      <ScheduledPostStep2DevClient />
    </Suspense>
  );
}
