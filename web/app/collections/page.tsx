import type { Metadata } from "next";
import { CollectionsPageClient } from "../components/collections/collections-page-client";

export const metadata: Metadata = {
  title: "Relay — Collections",
  description:
    "Your personal library of finds. Collect, tag, and browse anything — articles, images, links, and more.",
};

export default function CollectionsPage() {
  return <CollectionsPageClient />;
}
