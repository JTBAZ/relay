/**
 * Snip: ring with a gap and a small offset segment (extract one piece from a batch).
 * Stroke uses currentColor — parent sets text color (muted green idle, selection accent active).
 */
export default function SnipIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      {/* Main ring ~320°; gap ~1–2 o'clock after rotation */}
      <circle
        cx="12"
        cy="12"
        r="7.25"
        stroke="currentColor"
        strokeWidth="2.75"
        strokeLinecap="round"
        strokeDasharray="39.5 6.8"
        transform="rotate(-48 12 12)"
      />
      {/* Snipped chip: short arc sitting outside the gap */}
      <path
        d="M 17.2 6.35 A 7.9 7.9 0 0 1 18.85 8.9"
        stroke="currentColor"
        strokeWidth="2.35"
        strokeLinecap="round"
      />
    </svg>
  );
}
