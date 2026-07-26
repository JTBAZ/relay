import { Suspense } from "react";
import StudioLab2PageClient from "./lab2-page-client";

function Fallback() {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center bg-[#050706] text-sm text-[#888]">
      Loading…
    </div>
  );
}

export default function StudioLab2Page() {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#050706] text-[#e8e8e8]">
      <Suspense fallback={<Fallback />}>
        <StudioLab2PageClient />
      </Suspense>
    </div>
  );
}
