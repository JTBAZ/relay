import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import VisitorGalleryView from "@/app/components/VisitorGalleryView";
import { fetchPublicCreatorBySlug } from "@/lib/relay-api";
import { isReservedPathSegment } from "@/lib/reserved-paths";

type Props = { params: { handle: string } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const handle = decodeURIComponent(params.handle).trim();
  if (isReservedPathSegment(handle)) {
    return { title: "Profile not found · Relay", robots: { index: false, follow: false } };
  }

  const resolved = await fetchPublicCreatorBySlug(handle);
  if (!resolved) {
    return { title: "Profile not found · Relay", robots: { index: false, follow: false } };
  }

  const title = resolved.display_name?.trim() || resolved.username?.trim() || handle;
  const description =
    resolved.bio?.trim() ||
    resolved.discipline?.trim() ||
    `Public Relay gallery for ${title}.`;

  return {
    title: `${title} · Relay`,
    description,
    alternates: { canonical: `/${resolved.public_slug || handle}` },
    openGraph: {
      title: `${title} · Relay`,
      description,
      images: resolved.avatar_url ? [{ url: resolved.avatar_url }] : undefined
    },
    twitter: {
      card: resolved.avatar_url ? "summary_large_image" : "summary",
      title: `${title} · Relay`,
      description,
      images: resolved.avatar_url ? [resolved.avatar_url] : undefined
    }
  };
}

export default async function CreatorPublicProfilePage({ params }: Props) {
  const handle = decodeURIComponent(params.handle).trim();
  if (isReservedPathSegment(handle)) {
    notFound();
  }

  const resolved = await fetchPublicCreatorBySlug(handle);

  if (!resolved) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#0A0A0A] px-4">
        <p className="text-sm text-[#9CA3AF]">No creator found for @{handle}</p>
        <p className="mt-2 text-center text-xs text-[#5A5A5A]">
          Check the link or ask them to share their Relay profile URL from Action Center.
        </p>
        <Link
          href="/feed"
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
      publicDisplayName={resolved.display_name ?? resolved.username ?? null}
      publicAvatarUrl={resolved.avatar_url ?? null}
      publicBannerUrl={resolved.banner_url ?? null}
      publicBio={resolved.bio ?? resolved.discipline ?? null}
    />
  );
}
