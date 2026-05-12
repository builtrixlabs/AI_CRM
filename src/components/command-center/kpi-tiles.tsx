import { Users, Flame, Target, TrendingUp, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "mint" | "amber" | "violet";

type Tile = {
  label: string;
  value: string;
  suffix?: string;
  delta: string;
  tone: Tone;
  Icon: LucideIcon;
};

const TILES: Tile[] = [
  { label: "Active leads", value: "247", delta: "+12", tone: "mint", Icon: Users },
  { label: "Hot pipeline", value: "38", delta: "+5", tone: "amber", Icon: Flame },
  { label: "Avg intent", value: "68", suffix: "/100", delta: "+4", tone: "violet", Icon: Target },
  { label: "Closed · MTD", value: "14", delta: "+3", tone: "mint", Icon: TrendingUp },
];

export function KpiTiles() {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {TILES.map((tile) => (
        <KpiTile key={tile.label} tile={tile} />
      ))}
    </div>
  );
}

function KpiTile({ tile }: { tile: Tile }) {
  const Icon = tile.Icon;
  return (
    <div className="cc-card cc-card-hover relative overflow-hidden px-5 py-4">
      <div className="flex items-start justify-between">
        <span
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-lg",
            tile.tone === "amber" && "cc-sigil-amber",
            tile.tone === "violet" && "cc-sigil-violet",
            tile.tone === "mint" && "cc-sigil-teal"
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
        <span
          className={cn(
            "cc-pill",
            tile.tone === "amber" && "cc-pill-amber",
            tile.tone === "violet" && "cc-pill-violet",
            tile.tone === "mint" && "cc-pill-mint"
          )}
        >
          {tile.delta}
        </span>
      </div>
      <div className="mt-6 flex items-baseline gap-1">
        <span className="text-3xl font-semibold tracking-tight tabular-nums">{tile.value}</span>
        {tile.suffix ? (
          <span className="text-sm text-muted-foreground tabular-nums">{tile.suffix}</span>
        ) : null}
      </div>
      <div className="cc-eyebrow cc-eyebrow-soft mt-1">{tile.label}</div>
    </div>
  );
}
