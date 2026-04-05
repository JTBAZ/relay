import { Suspense } from "react";
import DesignerView from "./DesignerView";

function DesignerFallback() {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center bg-[#0a0807] text-sm text-[#8a7f72]">
      Loading designer…
    </div>
  );
}

export default function DesignerPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Suspense fallback={<DesignerFallback />}>
        <DesignerView />
      </Suspense>
    </div>
  );
}
