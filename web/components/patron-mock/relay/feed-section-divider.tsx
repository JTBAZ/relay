import { Compass } from "lucide-react";

interface FeedSectionDividerProps {
  label: string;
  sublabel?: string;
}

export function FeedSectionDivider({
  label,
  sublabel,
}: FeedSectionDividerProps) {
  return (
    <div className="flex items-center gap-3 my-1" role="separator">
      <div className="h-px flex-1 bg-[#1E1E1E]" />
      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[#222222] bg-[#0F0F0F]">
        <Compass size={11} className="text-[#2D6A4F] shrink-0" />
        <span className="text-[11px] text-[#6B7280] font-medium whitespace-nowrap tracking-wide">
          {label}
        </span>
        {sublabel && (
          <>
            <span className="text-[#222222] select-none">·</span>
            <span className="text-[11px] text-[#4B5563] whitespace-nowrap">
              {sublabel}
            </span>
          </>
        )}
      </div>
      <div className="h-px flex-1 bg-[#1E1E1E]" />
    </div>
  );
}
