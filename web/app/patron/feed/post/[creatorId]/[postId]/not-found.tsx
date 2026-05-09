import Link from "next/link";

export default function PatronFeedPostNotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0A0A0A] px-6 text-center">
      <h1 className="mb-2 text-lg font-semibold text-[#E5E7EB]">Post not available</h1>
      <p className="mb-6 max-w-md text-sm text-[#6B7280]">
        This post may be private, removed, or your account may not have access. Try reconnecting
        Patreon if you are a member.
      </p>
      <Link
        href="/patron/feed"
        className="text-sm font-medium text-[#2D6A4F] transition-colors hover:text-[#40916C]"
      >
        Back to feed
      </Link>
    </div>
  );
}
