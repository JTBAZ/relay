import GalleryView from "./GalleryView";
import { StudioRouteGuard } from "./components/studio/StudioRouteGuard";

export default function Home() {
  return (
    <StudioRouteGuard>
      <GalleryView />
    </StudioRouteGuard>
  );
}
