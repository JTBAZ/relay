import { notFound } from "next/navigation";
import { PatronPostDetailClient } from "@/components/patron/relay/patron-post-detail-client";
import { fetchPublicCreatorBySlug } from "@/lib/relay-api";
import { isReservedPathSegment } from "@/lib/reserved-paths";

export default async function CreatorPostDetailPage({
  params,
  searchParams
}: {
  params: { handle: string; postId: string };
  searchParams?: { media_id?: string; intent?: string };
}) {
  const handle = decodeURIComponent(params.handle).trim();
  if (isReservedPathSegment(handle)) {
    notFound();
  }

  const resolved = await fetchPublicCreatorBySlug(handle);
  if (!resolved) {
    notFound();
  }

  const initialMediaId =
    typeof searchParams?.media_id === "string"
      ? decodeURIComponent(searchParams.media_id)
      : undefined;
  const initialIntent =
    searchParams?.intent === "comment" || searchParams?.intent === "snip"
      ? searchParams.intent
      : undefined;

  return (
    <PatronPostDetailClient
      creatorId={resolved.relay_creator_id}
      postId={decodeURIComponent(params.postId)}
      initialMediaId={initialMediaId}
      initialIntent={initialIntent}
    />
  );
}
