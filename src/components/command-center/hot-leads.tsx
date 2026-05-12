import { X } from "lucide-react";

type HotLead = {
  initials: string;
  name: string;
  meta: string;
};

const LEADS: HotLead[] = [
  { initials: "RM", name: "Rohit Menon", meta: "Lead 88421 · Nanganallur · 2m ago" },
  { initials: "PR", name: "Priya Raghavan", meta: "Nanganallur · ₹1.4 – 1.7 Cr" },
  { initials: "KS", name: "Karthik Sundaram", meta: "Velachery · ₹85L – 1.1 Cr" },
];

export function HotLeadsStrip() {
  return (
    <section
      className="cc-card flex items-center gap-3 overflow-hidden px-4 py-3"
      aria-label="Hot leads"
    >
      <span
        className="cc-eyebrow shrink-0"
        style={{ color: "var(--cc-hot-500)" }}
      >
        Hot Leads
      </span>
      <div className="flex flex-1 items-center gap-3 overflow-x-auto">
        {LEADS.map((lead) => (
          <HotLeadChip key={lead.name} lead={lead} />
        ))}
      </div>
      <button
        type="button"
        aria-label="Dismiss hot leads strip"
        className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </section>
  );
}

function HotLeadChip({ lead }: { lead: HotLead }) {
  return (
    <div className="flex shrink-0 items-center gap-3 rounded-xl border border-white/[0.04] bg-white/[0.02] py-1.5 pl-1.5 pr-4">
      <span className="cc-sigil-amber flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-semibold">
        {lead.initials}
      </span>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{lead.name}</span>
          <span className="cc-pill cc-pill-hot text-[10px]">HOT</span>
        </div>
        <div className="cc-eyebrow cc-eyebrow-soft text-[9.5px]">{lead.meta}</div>
      </div>
    </div>
  );
}
