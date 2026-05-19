import type { LucideIcon } from "lucide-react";

export type MetricTrend = "up" | "down" | "flat";

type Props = {
  label: string;
  value: number | string;
  delta?: string;
  trend?: MetricTrend;
  Icon?: LucideIcon;
};

export function BuiltrixMetricTile({
  label,
  value,
  delta,
  trend = "up",
  Icon,
}: Props) {
  const displayValue =
    typeof value === "number" ? value.toLocaleString("en-IN") : value;
  return (
    <div className="bcmd-metric-card" data-testid="bcmd-metric-tile">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="bcmd-metric-label truncate">{label}</div>
          <div className="bcmd-metric-value">{displayValue}</div>
          {delta ? (
            <div className="bcmd-metric-delta" data-trend={trend}>
              {delta}
            </div>
          ) : null}
        </div>
        {Icon ? (
          <span className="bcmd-metric-icon" aria-hidden="true">
            <Icon />
          </span>
        ) : null}
      </div>
    </div>
  );
}
