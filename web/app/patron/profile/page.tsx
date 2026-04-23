import Link from "next/link";
import { ProfilePage } from "@/components/patron/relay/profile-page";

export default function PatronProfilePage() {
  return (
    <div className="min-h-screen bg-[#0A0A0A]">
      <header className="flex flex-wrap items-center gap-4 border-b border-[#1A1A1A] px-4 py-4">
        <Link
          href="/patron/feed"
          className="text-sm text-[#2D6A4F] transition-colors hover:text-[#40916C]"
        >
          ← Back to feed
        </Link>
        <Link
          href="/settings/connected-extensions"
          className="text-sm text-[#6B7280] transition-colors hover:text-[#40916C]"
        >
          Connected extensions
        </Link>
      </header>
      <ProfilePage />
    </div>
  );
}
