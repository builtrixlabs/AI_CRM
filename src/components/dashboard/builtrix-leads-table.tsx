import Link from "next/link";
import type { CcHotLead } from "@/lib/command-center/data";

const STAGE_TONES: Record<string, [string, string]> = {
  new: ["var(--indigo-100)", "var(--indigo-700)"],
  contacted: ["var(--amethyst-100)", "var(--amethyst-800)"],
  qualified: ["var(--copper-100)", "var(--copper-800)"],
  site_visit: ["var(--amethyst-100)", "var(--amethyst-800)"],
  token_paid: ["var(--copper-100)", "var(--copper-800)"],
  reviewing: ["var(--indigo-100)", "var(--indigo-700)"],
  negotiation: ["var(--amethyst-100)", "var(--amethyst-800)"],
};

type Row = {
  id: string;
  name: string;
  phone: string | null;
  stage: string;
  score: number;
};

type Props = {
  title?: string;
  subtitle?: string;
  rows: Row[];
  emptyHint?: string;
};

export function BuiltrixLeadsTable({
  title = "Hot pipeline",
  subtitle = "Top intent leads · last 24h",
  rows,
  emptyHint,
}: Props) {
  return (
    <section className="bcmd-card" data-testid="bcmd-leads-table">
      <header className="bcmd-section-header">
        <div className="min-w-0">
          <h3 className="bcmd-section-title">{title}</h3>
          <p className="bcmd-section-subtitle">{subtitle}</p>
        </div>
      </header>
      {rows.length === 0 ? (
        <div className="px-6 py-10 text-center font-sans text-sm text-[var(--fg3)]">
          {emptyHint ?? "No leads in this window."}
        </div>
      ) : (
        <>
          <div
            className="bcmd-table-header"
            style={{
              gridTemplateColumns: "1.6fr 1.1fr 1fr 90px",
            }}
          >
            <div>Lead</div>
            <div>Phone</div>
            <div>Stage</div>
            <div className="text-right">Score</div>
          </div>
          {rows.map((row) => (
            <Link
              key={row.id}
              href={`/dashboard/leads/${row.id}`}
              className="bcmd-table-row"
              style={{ gridTemplateColumns: "1.6fr 1.1fr 1fr 90px" }}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="bcmd-avatar-gradient" aria-hidden="true">
                  {initialsFromName(row.name)}
                </span>
                <span className="font-display text-[13px] font-semibold text-[var(--fg1)] truncate">
                  {row.name}
                </span>
              </div>
              <div className="font-mono text-[12px] text-[var(--fg2)] truncate">
                {row.phone ?? "—"}
              </div>
              <div>
                <StagePill stage={row.stage} />
              </div>
              <div
                className="text-right font-mono text-[14px] font-semibold tabular-nums"
                style={{ color: "var(--copper-700)" }}
              >
                {Math.round(row.score)}
              </div>
            </Link>
          ))}
        </>
      )}
    </section>
  );
}

export function leadRowsFromHotLeads(hot: readonly CcHotLead[]): Row[] {
  return hot.map((h) => ({
    id: h.id,
    name: h.label,
    phone: h.phone,
    stage: "Qualified",
    score: h.intent_score,
  }));
}

function StagePill({ stage }: { stage: string }) {
  const normalised = stage.toLowerCase().replace(/\s+/g, "_");
  const [bg, fg] = STAGE_TONES[normalised] ?? [
    "var(--slate-100)",
    "var(--slate-700)",
  ];
  return (
    <span
      style={{
        padding: "3px 10px",
        borderRadius: 999,
        background: bg,
        color: fg,
        fontFamily: "var(--font-display)",
        fontSize: 11,
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
    >
      {prettyStage(stage)}
    </span>
  );
}

function prettyStage(s: string): string {
  return s
    .replace(/_/g, " ")
    .split(" ")
    .map((p) => (p ? p[0].toUpperCase() + p.slice(1) : p))
    .join(" ");
}

function initialsFromName(name: string): string {
  if (!name) return "··";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
