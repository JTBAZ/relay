import type { Metadata } from "next";
import { PatronCollectionDetailClient } from "./PatronCollectionDetailClient";

export const metadata: Metadata = {
  title: "Relay · Collection",
  description: "Your saved snips in a media-first gallery.",
};

export default function PatronCollectionDetailPage({
  params,
}: {
  params: { collectionId: string };
}) {
  return (
    <PatronCollectionDetailClient collectionId={decodeURIComponent(params.collectionId)} />
  );
}
