"use client";

type HeroData = {
  title: string;
  subtitle?: string;
  cover_media_id?: string;
};

type Props = {
  hero?: HeroData;
  onChange: (hero: HeroData | undefined) => void;
};

export default function HeroEditor({ hero, onChange }: Props) {
  if (!hero) {
    return (
      <button
        type="button"
        onClick={() => onChange({ title: "Welcome" })}
        className="w-full text-xs py-2 border border-dashed border-[#4a3f36] rounded text-[#8a7f72] hover:border-[#e8a077] hover:text-[#e8a077]"
      >
        + Add Hero Section
      </button>
    );
  }

  return (
    <div className="space-y-2 p-3 border border-[#3d342b] rounded bg-[#1a1410]">
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-[0.2em] text-[#b8a995]">Hero Section</p>
        <button
          type="button"
          onClick={() => onChange(undefined)}
          className="text-[10px] text-[#8a7f72] hover:text-red-400"
        >
          Remove
        </button>
      </div>
      <input
        value={hero.title}
        onChange={(e) => onChange({ ...hero, title: e.target.value })}
        placeholder="Hero title"
        className="w-full bg-[#2a221c] border border-[#4a3f36] px-3 py-1.5 rounded text-sm text-[#ede5da]"
      />
      <input
        value={hero.subtitle ?? ""}
        onChange={(e) => onChange({ ...hero, subtitle: e.target.value || undefined })}
        placeholder="Subtitle (optional)"
        className="w-full bg-[#2a221c] border border-[#4a3f36] px-3 py-1.5 rounded text-sm text-[#ede5da]"
      />
      <div>
        <p className="text-[10px] uppercase tracking-[0.2em] text-[#b8a995] mb-1">
          Cover image (media id)
        </p>
        <input
          value={hero.cover_media_id ?? ""}
          onChange={(e) =>
            onChange({
              ...hero,
              cover_media_id: e.target.value.trim() || undefined
            })
          }
          placeholder="Exported media id for hero background"
          className="w-full bg-[#2a221c] border border-[#4a3f36] px-3 py-1.5 rounded text-xs text-[#ede5da] font-mono"
        />
        <p className="text-[10px] text-[#8a7f72] mt-1">
          Use an image asset from your Library (same id as in grid rows). Shown full-bleed behind the title in preview.
        </p>
      </div>
    </div>
  );
}
