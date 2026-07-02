import { PatronPostDetailClient } from "@/components/patron/relay/patron-post-detail-client";

export default function PatronFeedPostDetailPage({
  params,
  searchParams,
}: {
  params: { creatorId: string; postId: string };
  searchParams?: { media_id?: string; intent?: string };
}) {
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
      creatorId={decodeURIComponent(params.creatorId)}
      postId={decodeURIComponent(params.postId)}
      initialMediaId={initialMediaId}
      initialIntent={initialIntent}
    />
  );
}
