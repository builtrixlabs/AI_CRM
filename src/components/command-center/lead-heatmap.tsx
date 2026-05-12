import { cn } from "@/lib/utils";

type ClusterTone = "teal" | "violet" | "amber" | "mint";
type ClusterState = "high" | "warm" | "hot" | "cooling" | "surging";

type Cluster = {
  id: string;
  label: string;
  count: string;
  conversion: string;
  x: number; // percent from left
  y: number; // percent from top
  size: number; // px
  tone: ClusterTone;
  state: ClusterState;
};

const CLUSTERS: Cluster[] = [
  { id: "1", label: "Sholinganallur", count: "1.8k", conversion: "64%", x: 70, y: 22, size: 130, tone: "teal", state: "high" },
  { id: "2", label: "Velachery", count: "5.1k", conversion: "71%", x: 32, y: 35, size: 170, tone: "teal", state: "warm" },
  { id: "3", label: "OMR", count: "8.2k", conversion: "92%", x: 22, y: 50, size: 195, tone: "amber", state: "hot" },
  { id: "4", label: "Nanganallur", count: "12.6k", conversion: "88%", x: 60, y: 65, size: 230, tone: "violet", state: "surging" },
  { id: "5", label: "ECR", count: "3.4k", conversion: "41%", x: 35, y: 80, size: 110, tone: "mint", state: "cooling" },
];

const RANGES = ["Now", "7d", "30d"] as const;

export function LeadHeatmap() {
  return (
    <section className="cc-card relative flex h-full flex-col overflow-hidden">
      <header className="flex items-start justify-between border-b border-white/[0.04] px-5 py-4">
        <div>
          <div className="cc-eyebrow cc-eyebrow-soft">02 · Semantic Heatmap</div>
          <h2 className="mt-1 text-base font-semibold">Leads clustered by intent, not pin</h2>
        </div>
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <span
              key={r}
              className={cn(
                "rounded-md px-2 py-1 cc-eyebrow",
                r === "30d" ? "bg-white/[0.04] text-foreground" : "text-muted-foreground"
              )}
            >
              {r}
            </span>
          ))}
        </div>
      </header>

      <div className="relative flex-1 cc-bg-grid">
        {CLUSTERS.map((c) => (
          <ClusterBlob key={c.id} cluster={c} />
        ))}
        <div className="absolute bottom-3 left-3 flex items-center gap-3 text-xs">
          <LegendDot label="high intent" tone="violet" />
          <LegendDot label="exploring" tone="teal" />
          <LegendDot label="cooling" tone="amber" />
        </div>
      </div>
    </section>
  );
}

function ClusterBlob({ cluster }: { cluster: Cluster }) {
  return (
    <div
      className="absolute"
      style={{
        left: `${cluster.x}%`,
        top: `${cluster.y}%`,
        width: cluster.size,
        height: cluster.size,
        transform: "translate(-50%, -50%)",
      }}
    >
      <div className={cn("absolute inset-0", `cc-blob-${cluster.tone}`)} aria-hidden="true" />
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 translate-y-3 whitespace-nowrap cc-eyebrow text-foreground/85">
        {cluster.label} · {capitalize(cluster.state)} · {cluster.count} · {cluster.conversion}
      </div>
    </div>
  );
}

function LegendDot({ label, tone }: { label: string; tone: "teal" | "violet" | "amber" }) {
  const bg =
    tone === "violet"
      ? "var(--cc-violet-500)"
      : tone === "teal"
        ? "var(--cc-teal-500)"
        : "var(--cc-amber-500)";
  return (
    <span className="flex items-center gap-1.5 text-muted-foreground">
      <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: bg }} />
      {label}
    </span>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
