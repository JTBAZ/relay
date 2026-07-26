import { Suspense } from "react";
import StudioLabPageClient from "./lab-page-client";

function Fallback() {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center bg-[#050706] text-sm text-[#888]">
      Loading…
    </div>
  );
}

export default function StudioLabPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#050706] text-[#e8e8e8]">
      <Suspense fallback={<Fallback />}>
        <StudioLabPageClient />
      </Suspense>
    </div>
  );
}
