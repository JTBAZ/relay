import type { Metadata } from "next";
import { Suspense } from "react";
import CreatorProfileClient from "./CreatorProfileClient";
import { StudioRouteGuard } from "../../components/studio/StudioRouteGuard";

export const metadata: Metadata = {
  title: "Profile · Relay",
  description:
    "Set your display name, avatar, banner, and bio so patrons recognize you across Relay.",
};

function Fallback() {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center bg-[var(--lib-bg)] text-sm text-[var(--lib-fg-muted)]">
      Loading profile…
    </div>
  );
}

export default function DesignerProfilePage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Suspense fallback={<Fallback />}>
        <StudioRouteGuard>
          <CreatorProfileClient />
        </StudioRouteGuard>
      </Suspense>
    </div>
  );
}
