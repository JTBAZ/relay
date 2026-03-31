"use client";

type ColorScheme = "dark" | "light" | "warm";

type Props = {
  colorScheme: ColorScheme;
  accentColor?: string;
  onChange: (scheme: ColorScheme, accent?: string) => void;
};

const schemes: { value: ColorScheme; label: string; preview: string }[] = [
  { value: "dark", label: "Dark", preview: "bg-[#100c0a]" },
  { value: "light", label: "Light", preview: "bg-[#f5f0eb]" },
  { value: "warm", label: "Warm", preview: "bg-[#2a1f17]" }
];

const presetAccents = ["#c45c2d", "#2d6a5c", "#5c2dc4", "#c42d5c", "#2d8ac4", "#8ac42d"];

export default function ThemePicker({ colorScheme, accentColor, onChange }: Props) {
  return (
    <div className="space-y-3">
      <div>
        <p className="text-[10px] uppercase tracking-[0.2em] text-[#b8a995] mb-2">Color Scheme</p>
        <div className="flex gap-2">
          {schemes.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => onChange(s.value, accentColor)}
              className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded border ${
                colorScheme === s.value
                  ? "border-[#e8a077] text-white"
                  : "border-[#4a3f36] text-[#c9bfb3]"
              }`}
            >
              <span className={`w-3 h-3 rounded-full ${s.preview} border border-[#5c4f44]`} />
              {s.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="text-[10px] uppercase tracking-[0.2em] text-[#b8a995] mb-2">Accent Color</p>
        <div className="flex gap-2">
          {presetAccents.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onChange(colorScheme, c)}
              className={`w-7 h-7 rounded-full border-2 ${
                accentColor === c ? "border-white" : "border-transparent"
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
