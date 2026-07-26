/**
 * Curator status badge (MB-14). Live signal from wire `is_curator` — never cache locally.
 */
export function CuratorBadge({
  className = ""
}: {
  className?: string;
}): React.ReactElement {
  return (
    <span
      data-testid="curator-badge"
      className={[
        "inline-flex shrink-0 items-center rounded-full border border-[#2D6A4F]/70",
        "bg-[#0c1e16] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[#9bf0c4]",
        className
      ]
        .filter(Boolean)
        .join(" ")}
      title="Curator"
    >
      Curator
    </span>
  );
}
