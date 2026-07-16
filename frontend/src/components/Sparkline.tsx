type SparklineProps = {
  values: number[];
  width?: number;
  height?: number;
  className?: string;
};

/** Tiny mint sparkline for site list rows. */
export default function Sparkline({
  values,
  width = 56,
  height = 22,
  className,
}: SparklineProps) {
  const pts = values.length > 0 ? values : [0, 0, 0, 0];
  const max = Math.max(...pts, 1);
  const min = Math.min(...pts, 0);
  const span = Math.max(max - min, 1);
  const step = pts.length > 1 ? width / (pts.length - 1) : width;

  const path = pts
    .map((v, i) => {
      const x = i * step;
      const y = height - ((v - min) / span) * (height - 3) - 1.5;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg
      className={className}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden
    >
      <path
        d={path}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.9"
      />
    </svg>
  );
}
