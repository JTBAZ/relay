"use client";

export function RelayLogo({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const iconSize = size === "sm" ? 20 : size === "lg" ? 32 : 26;
  const textClass = size === "sm" ? "text-base" : size === "lg" ? "text-2xl" : "text-xl";

  return (
    <div className="flex items-center gap-2.5">
      <svg
        width={iconSize}
        height={iconSize}
        viewBox="0 0 32 32"
        fill="none"
        aria-hidden="true"
        className="flex-shrink-0"
      >
        <circle cx="16" cy="16" r="14" stroke="var(--relay-gold-500, #c5b358)" strokeWidth="1.5" fill="none" />
        <circle cx="16" cy="16" r="2.5" fill="var(--relay-gold-500, #c5b358)" />
        <circle cx="8" cy="10" r="2" fill="var(--relay-gold-500, #c5b358)" />
        <circle cx="24" cy="10" r="2" fill="var(--relay-gold-500, #c5b358)" />
        <circle cx="16" cy="25" r="2" fill="var(--relay-gold-500, #c5b358)" />
        <line x1="16" y1="16" x2="8" y2="10" stroke="var(--relay-gold-500, #c5b358)" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="16" y1="16" x2="24" y2="10" stroke="var(--relay-gold-500, #c5b358)" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="16" y1="16" x2="16" y2="25" stroke="var(--relay-gold-500, #c5b358)" strokeWidth="1.5" strokeLinecap="round" />
        <polyline
          points="13,21 14.5,18 15.5,22 17,19 18,21"
          stroke="var(--relay-gold-500, #c5b358)"
          strokeWidth="1"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>
      <span
        className={`${textClass} font-bold leading-none tracking-tight`}
        style={{ color: "var(--relay-gold-500, #c5b358)" }}
      >
        Relay
      </span>
    </div>
  );
}
