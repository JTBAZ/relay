import Link from "next/link";
import { ProfilePage } from "@/components/patron-mock/relay/profile-page";

export default function PatronProfilePage() {
  return (
    <div className="min-h-screen bg-[#0A0A0A]">
      <header className="flex items-center gap-4 border-b border-[#1A1A1A] px-4 py-4">
        <Link
          href="/patron/feed"
          className="text-sm text-[#2D6A4F] transition-colors hover:text-[#40916C]"
        >
          ← Back to feed
        </Link>
      </header>
      <ProfilePage />
    </div>
  );
}
