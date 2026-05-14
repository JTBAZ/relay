import { StudioRouteGuard } from "../components/studio/StudioRouteGuard";
import ManualImportPageClient from "./manual-import-page-client";

export default function ManualImportPage() {
  return (
    <StudioRouteGuard>
      <ManualImportPageClient />
    </StudioRouteGuard>
  );
}
