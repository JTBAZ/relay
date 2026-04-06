/**
 * Relay wordmark — gold-on-dark SVG mark + logotype.
 * Gold is reserved for logo / hero surfaces only per brand spec.
 */
export function RelayWordmark({ className }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-2 select-none ${className ?? ""}`}
      aria-label="Relay"
    >
      <svg
        width="28"
        height="28"
        viewBox="0 0 28 28"
        fill="none"
        aria-hidden="true"
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle cx="14" cy="14" r="13" stroke="#C5B358" strokeWidth="1.25" />
        <circle cx="14" cy="7" r="2" fill="#D4AF37" />
        <circle cx="21" cy="18" r="2" fill="#D4AF37" />
        <circle cx="7" cy="18" r="2" fill="#D4AF37" />
        <line x1="14" y1="9" x2="14" y2="14" stroke="#C5B358" strokeWidth="1" strokeLinecap="round" />
        <line x1="14" y1="14" x2="19.5" y2="17" stroke="#C5B358" strokeWidth="1" strokeLinecap="round" />
        <line x1="14" y1="14" x2="8.5" y2="17" stroke="#C5B358" strokeWidth="1" strokeLinecap="round" />
        <circle cx="14" cy="14" r="1.75" fill="#D4AF37" />
      </svg>

      <span
        className="font-semibold tracking-tight text-xl leading-none"
        style={{ color: "#D4AF37", letterSpacing: "-0.01em" }}
      >
        Relay
      </span>
    </span>
  );
}
