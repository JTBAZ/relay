import Link from "next/link";
import VisitorGalleryView from "@/app/components/VisitorGalleryView";
import { fetchPublicCreatorBySlug } from "@/lib/relay-api";

type Props = { params: { handle: string } };

export default async function PatronCreatorProfilePage({ params }: Props) {
  const handle = decodeURIComponent(params.handle).trim();
  const resolved = await fetchPublicCreatorBySlug(handle);

  if (!resolved) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#0A0A0A] px-4">
        <p className="text-sm text-[#9CA3AF]">No creator found for @{handle}</p>
        <p className="mt-2 text-center text-xs text-[#5A5A5A]">
          Check the link or ask them to share their Relay profile URL from Action Center.
        </p>
        <Link
          href="/patron/feed"
          className="mt-8 text-sm text-[#2D6A4F] transition-colors hover:text-[#40916C]"
        >
          Back to feed
        </Link>
      </div>
    );
  }

  return (
    <VisitorGalleryView
      relayCreatorId={resolved.relay_creator_id}
      publicSlug={resolved.public_slug}
    />
  );
}
