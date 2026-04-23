/**
 * Relay wordmark graphic — three-node “Y” network inside a ring.
 * Vector recreation in brand gold (`currentColor`); scales at any size.
 * (Raster exports ~300px wide are too soft for small toolbar use — prefer this SVG.)
 */
export function RelayMarkIcon({
  size = 28,
  className,
  title,
}: {
  size?: number;
  className?: string;
  title?: string;
}) {
  const hub = { x: 16, y: 16 };
  const arm = 6.75;
  const sqrt32 = (Math.sqrt(3) / 2) * arm;
  const tips = {
    up: { x: 16, y: 16 - arm },
    downRight: { x: 16 + sqrt32, y: 16 + arm / 2 },
    downLeft: { x: 16 - sqrt32, y: 16 + arm / 2 },
  };

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
    >
      {title ? <title>{title}</title> : null}
      <circle cx="16" cy="16" r="10.75" stroke="currentColor" strokeWidth="1.2" />
      <line
        x1={hub.x}
        y1={hub.y}
        x2={tips.up.x}
        y2={tips.up.y}
        stroke="currentColor"
        strokeWidth="1.15"
        strokeLinecap="round"
      />
      <line
        x1={hub.x}
        y1={hub.y}
        x2={tips.downRight.x}
        y2={tips.downRight.y}
        stroke="currentColor"
        strokeWidth="1.15"
        strokeLinecap="round"
      />
      <line
        x1={hub.x}
        y1={hub.y}
        x2={tips.downLeft.x}
        y2={tips.downLeft.y}
        stroke="currentColor"
        strokeWidth="1.15"
        strokeLinecap="round"
      />
      <circle cx={tips.up.x} cy={tips.up.y} r="1.35" fill="currentColor" />
      <circle cx={tips.downRight.x} cy={tips.downRight.y} r="1.35" fill="currentColor" />
      <circle cx={tips.downLeft.x} cy={tips.downLeft.y} r="1.35" fill="currentColor" />
      <circle cx={hub.x} cy={hub.y} r="1.15" fill="currentColor" />
    </svg>
  );
}
