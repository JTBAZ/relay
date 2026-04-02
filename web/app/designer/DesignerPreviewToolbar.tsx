"use client";

const BREAKPOINTS = [
  { label: "Desktop", width: 1280 },
  { label: "Tablet", width: 768 },
  { label: "Phone", width: 390 }
] as const;

type Props = {
  previewWidth: number;
  onPreviewWidth: (w: number) => void;
};

export default function DesignerPreviewToolbar({ previewWidth, onPreviewWidth }: Props) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#2a2420] bg-[#0f0c0a]/95 px-4 py-2.5">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-medium uppercase tracking-[0.22em] text-[#8a7f72]">
          Live preview
        </span>
        <span className="hidden text-[10px] text-[#5c534a] sm:inline">
          Patron-facing layout — how your gallery reads on the web
        </span>
      </div>
      <div className="flex items-center gap-1 rounded-lg border border-[#3d342b] bg-[#161210] p-0.5">
        {BREAKPOINTS.map((bp) => {
          const active = previewWidth === bp.width;
          return (
            <button
              key={bp.width}
              type="button"
              onClick={() => onPreviewWidth(bp.width)}
              className={`rounded-md px-3 py-1 text-[10px] font-medium motion-safe:transition-colors motion-safe:duration-200 ${
                active
                  ? "bg-[#2a221c] text-[#f0e6d8] shadow-sm"
                  : "text-[#8a7f72] hover:text-[#c9bfb3]"
              }`}
            >
              {bp.label}
              <span className="ml-1 tabular-nums opacity-60">{bp.width}px</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
