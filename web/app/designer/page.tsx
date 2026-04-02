import { Suspense } from "react";
import DesignerView from "./DesignerView";

function DesignerFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0a0807] text-sm text-[#8a7f72]">
      Loading designer…
    </div>
  );
}

export default function DesignerPage() {
  return (
    <Suspense fallback={<DesignerFallback />}>
      <DesignerView />
    </Suspense>
  );
}
