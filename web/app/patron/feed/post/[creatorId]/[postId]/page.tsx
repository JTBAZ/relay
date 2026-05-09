import { PatronPostDetailClient } from "@/components/patron/relay/patron-post-detail-client";

export default function PatronFeedPostDetailPage({
  params,
}: {
  params: { creatorId: string; postId: string };
}) {
  return (
    <PatronPostDetailClient
      creatorId={decodeURIComponent(params.creatorId)}
      postId={decodeURIComponent(params.postId)}
    />
  );
}
