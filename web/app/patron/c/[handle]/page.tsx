import Link from "next/link";

type Props = { params: { handle: string } };

export default function PatronCreatorProfileStubPage({ params }: Props) {
  const handle = decodeURIComponent(params.handle);
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0A0A0A] px-4">
      <p className="text-sm text-[#9CA3AF]">
        Creator <span className="text-[#C8C8C8]">@{handle}</span>
      </p>
      <p className="mt-2 text-center text-xs text-[#5A5A5A]">
        Public profile shell (mock) — wire to Relay + Patreon when the API is ready.
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
