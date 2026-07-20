import { GalleryApp } from "@/components/GalleryApp";
import { loadSite } from "@/lib/load-site";

export default function PreviewPage() {
  const site = loadSite();
  return <GalleryApp site={site} />;
}
