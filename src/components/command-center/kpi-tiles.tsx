import { Users, Flame, Target, TrendingUp, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CcKpis } from "@/lib/command-center/data";

type Tone = "mint" | "amber" | "violet";
type Tile = {
  label: string;
  value: string;
  suffix?: string;
  tone: Tone;
  Icon: LucideIcon;
};

// D-605 — real org/role-scoped KPIs. The mockup's period-over-period
// "delta" pills are dropped: V6 has no KPI-snapshot history (see directive
// Non-goals).
export function KpiTiles({ kpis }: { kpis: CcKpis }) {
  const tiles: Tile[] = [
    {
      label: "Active leads",
      value: String(kpis.active_leads),
      tone: "mint",
      Icon: Users,
    },
    {
      label: "Hot pipeline",
      value: String(kpis.hot_pipeline),
      tone: "amber",
      Icon: Flame,
    },
    {
      label: "Avg intent",
      value: String(kpis.avg_intent),
      suffix: "/100",
      tone: "violet",
      Icon: Target,
    },
    {
      label: "Closed · MTD",
      value: String(kpis.closed_mtd),
      tone: "mint",
      Icon: TrendingUp,
    },
  ];
  return (
    <div
      className="grid grid-cols-2 gap-4 lg:grid-cols-4"
      data-testid="cc-kpi-tiles"
    >
      {tiles.map((tile) => (
        <KpiTile key={tile.label} tile={tile} />
      ))}
    </div>
  );
}

function KpiTile({ tile }: { tile: Tile }) {
  const Icon = tile.Icon;
  return (
    <div
      className="cc-card cc-card-hover relative overflow-hidden px-5 py-4"
      data-testid={`cc-kpi-${tile.label}`}
    >
      <div className="flex items-start justify-between">
        <span
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-lg",
            tile.tone === "amber" && "cc-sigil-amber",
            tile.tone === "violet" && "cc-sigil-violet",
            tile.tone === "mint" && "cc-sigil-teal",
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="mt-6 flex items-baseline gap-1">
        <span className="text-3xl font-semibold tracking-tight tabular-nums">
          {tile.value}
        </span>
        {tile.suffix ? (
          <span className="text-sm text-muted-foreground tabular-nums">
            {tile.suffix}
          </span>
        ) : null}
      </div>
      <div className="cc-eyebrow cc-eyebrow-soft mt-1">{tile.label}</div>
    </div>
  );
}
