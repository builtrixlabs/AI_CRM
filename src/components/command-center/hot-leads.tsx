import Link from "next/link";
import type { CcHotLead } from "@/lib/command-center/data";

function initials(label: string): string {
  const parts = label.trim().split(/\s+/);
  return (
    ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?"
  );
}

// D-605 — real top-5 leads by intent score in the viewer's scope, each
// linking to the lead canvas.
export function HotLeadsStrip({ hotLeads }: { hotLeads: CcHotLead[] }) {
  return (
    <section
      className="cc-card flex items-center gap-3 overflow-hidden px-4 py-3"
      aria-label="Hot leads"
      data-testid="cc-hot-leads"
    >
      <span
        className="cc-eyebrow shrink-0"
        style={{ color: "var(--cc-hot-500)" }}
      >
        Hot Leads
      </span>
      <div className="flex flex-1 items-center gap-3 overflow-x-auto">
        {hotLeads.length === 0 ? (
          <span
            className="text-sm text-muted-foreground"
            data-testid="cc-hot-empty"
          >
            No high-intent leads yet.
          </span>
        ) : (
          hotLeads.map((lead) => (
            <Link
              key={lead.id}
              href={`/dashboard/leads/${lead.id}`}
              className="flex shrink-0 items-center gap-3 rounded-xl border border-white/[0.04] bg-white/[0.02] py-1.5 pl-1.5 pr-4 hover:bg-white/[0.04]"
              data-testid="cc-hot-chip"
            >
              <span className="cc-sigil-amber flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-semibold">
                {initials(lead.label)}
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">
                    {lead.label}
                  </span>
                  <span className="cc-pill cc-pill-hot text-[10px] tabular-nums">
                    {lead.intent_score}
                  </span>
                </div>
                <div className="cc-eyebrow cc-eyebrow-soft text-[9.5px]">
                  {lead.phone ?? "no phone on file"}
                </div>
              </div>
            </Link>
          ))
        )}
      </div>
    </section>
  );
}
