import type { PaywallStyle } from "@/lib/access";

export function PaywallTeaser({ style }: { style: PaywallStyle }) {
  const copy =
    style === "hard"
      ? "Members only"
      : style === "teaser"
        ? "Peek reserved for subscribers"
        : "Unlock to view";

  return (
    <div className="paywall-cta">
      <strong>{copy}</strong>
      <span className="cta">Join to unlock</span>
    </div>
  );
}
