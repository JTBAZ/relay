import Link from "next/link";
import { Store } from "lucide-react";

export default function CommissionHubPage() {
  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#C8C8C8]">
      <header className="flex items-center gap-4 border-b border-[#1A1A1A] px-4 py-4">
        <Link
          href="/patron/feed"
          className="text-sm text-[#2D6A4F] transition-colors hover:text-[#40916C]"
        >
          ← Back to feed
        </Link>
      </header>
      <main className="mx-auto max-w-lg space-y-4 px-4 py-8">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#222222] bg-[#111111] text-[#40916C]">
            <Store size={20} aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-[#E5E5E5]">Commission Hub</h1>
            <p className="mt-1 text-sm text-[#6B7280]">
              Browse open commissions, briefs, and requests from creators you follow. Full marketplace
              flows will connect here as they ship.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
