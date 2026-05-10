/**
 * D-312 — minimal inline-SVG sparkline. Zero external deps; renders one
 * polyline over a normalized 0..1 range with a subtle fill below.
 *
 * Server-component-safe (no client hooks). Caller controls width/height.
 */

export type SparklineProps = {
  values: number[];
  width?: number;
  height?: number;
  className?: string;
  strokeColor?: string;
  fillColor?: string;
};

export function Sparkline({
  values,
  width = 160,
  height = 40,
  className,
  strokeColor = "currentColor",
  fillColor,
}: SparklineProps) {
  if (values.length === 0) {
    return (
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className={className}
        aria-hidden="true"
      />
    );
  }
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const stepX = values.length > 1 ? width / (values.length - 1) : 0;
  const points = values
    .map((v, i) => {
      const x = i * stepX;
      const y = height - ((v - min) / range) * height;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      aria-hidden="true"
    >
      {fillColor && values.length > 1 && (
        <polygon
          points={`0,${height} ${points} ${width},${height}`}
          fill={fillColor}
          opacity="0.18"
        />
      )}
      <polyline
        points={points}
        fill="none"
        stroke={strokeColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
