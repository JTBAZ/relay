import type { Metadata } from "next";
import { Suspense } from "react";
import { StudioRouteGuard } from "@/app/components/studio/StudioRouteGuard";
import EarningsDashboardClient from "./EarningsDashboardClient";

export const metadata: Metadata = {
  title: "Earnings — Relay Studio",
  description: "Tip earnings from fans who reveal your promo pieces."
};

function Fallback() {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center bg-[var(--lib-bg)] text-sm text-[var(--lib-fg-muted)]">
      Loading…
    </div>
  );
}

export default function EarningsPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[var(--lib-bg)]">
      <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6">
        <h1 className="mb-6 text-2xl font-semibold tracking-tight text-[var(--lib-fg)]">
          Earnings
        </h1>
        <Suspense fallback={<Fallback />}>
          <StudioRouteGuard>
            <EarningsDashboardClient />
          </StudioRouteGuard>
        </Suspense>
      </div>
    </div>
  );
}
