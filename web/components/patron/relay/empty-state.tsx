import { Compass, Search } from "lucide-react";

interface EmptyStateProps {
  onSearch: () => void;
}

export function EmptyState({ onSearch }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-24 px-6 text-center">
      <div className="w-16 h-16 rounded-full bg-[#0D1F17] border border-[#1B4332] flex items-center justify-center mb-6">
        <Compass size={26} className="text-[#2D6A4F]" />
      </div>
      <h2 className="text-xl font-semibold text-[#F9FAFB] mb-3 text-balance">
        Your timeline is waiting
      </h2>
      <p className="text-sm text-[#6B7280] leading-relaxed max-w-[360px] mb-8 text-pretty">
        Follow creators you care about and their work will appear here. In the
        meantime, free posts from the broader Relay community are shown below.
      </p>
      <div className="flex flex-col gap-3 w-full max-w-[260px]">
        <button
          onClick={onSearch}
          className="flex items-center justify-center gap-2 px-4 py-2.5 bg-[#2D6A4F] hover:bg-[#40916C] text-[#F9FAFB] text-sm font-medium rounded-lg transition-colors duration-150"
        >
          <Search size={15} />
          Search for creators
        </button>
        <button className="flex items-center justify-center gap-2 px-4 py-2.5 bg-transparent border border-[#2A2A2A] text-[#9CA3AF] hover:border-[#333333] hover:text-[#F9FAFB] text-sm rounded-lg transition-colors duration-150">
          <Compass size={15} />
          Browse Discover
        </button>
      </div>
    </div>
  );
}
