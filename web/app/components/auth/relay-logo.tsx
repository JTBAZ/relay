"use client";

export function RelayLogo({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const sizes = {
    sm: { mark: 20, text: "text-lg" },
    md: { mark: 26, text: "text-2xl" },
    lg: { mark: 32, text: "text-3xl" }
  };
  const s = sizes[size];

  return (
    <div className="flex items-center gap-2.5">
      <svg
        width={s.mark}
        height={s.mark}
        viewBox="0 0 26 26"
        fill="none"
        aria-hidden="true"
      >
        <circle cx="13" cy="13" r="4" fill="#C5B358" />
        <circle cx="13" cy="13" r="7" stroke="#C5B358" strokeWidth="1" strokeOpacity="0.35" fill="none" />
        <line x1="13" y1="0" x2="13" y2="6" stroke="#C5B358" strokeWidth="1.2" strokeOpacity="0.5" />
        <line x1="13" y1="20" x2="13" y2="26" stroke="#C5B358" strokeWidth="1.2" strokeOpacity="0.5" />
        <line x1="0" y1="13" x2="6" y2="13" stroke="#C5B358" strokeWidth="1.2" strokeOpacity="0.5" />
        <line x1="20" y1="13" x2="26" y2="13" stroke="#C5B358" strokeWidth="1.2" strokeOpacity="0.5" />
        <circle cx="13" cy="0" r="1.5" fill="#C5B358" fillOpacity="0.5" />
        <circle cx="13" cy="26" r="1.5" fill="#C5B358" fillOpacity="0.5" />
        <circle cx="0" cy="13" r="1.5" fill="#C5B358" fillOpacity="0.5" />
        <circle cx="26" cy="13" r="1.5" fill="#C5B358" fillOpacity="0.5" />
      </svg>
      <span
        className={`${s.text} font-semibold tracking-tight`}
        style={{ color: "#C5B358", letterSpacing: "-0.02em" }}
      >
        Relay
      </span>
    </div>
  );
}
