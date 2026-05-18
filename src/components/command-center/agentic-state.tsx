import {
  Sparkles,
  Clock,
  CheckCircle2,
  Send,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { CcAgentic } from "@/lib/command-center/data";

type Tone = "amber" | "violet" | "teal" | "grey";

// D-605 — real agent_approval_queue summary (the mockup's fake
// orchestrations + progress bars are dropped).
export function AgenticState({ agentic }: { agentic: CcAgentic }) {
  const rows: Array<{
    label: string;
    value: number;
    tone: Tone;
    Icon: LucideIcon;
  }> = [
    {
      label: "Pending approval",
      value: agentic.pending,
      tone: "amber",
      Icon: Clock,
    },
    {
      label: "Approved",
      value: agentic.approved,
      tone: "violet",
      Icon: CheckCircle2,
    },
    {
      label: "Sent today",
      value: agentic.sent_today,
      tone: "teal",
      Icon: Send,
    },
    {
      label: "Rejected",
      value: agentic.rejected,
      tone: "grey",
      Icon: XCircle,
    },
  ];

  return (
    <section
      className="cc-card flex h-full flex-col overflow-hidden"
      data-testid="cc-agentic-state"
    >
      <header className="flex items-start justify-between border-b border-white/[0.04] px-5 py-4">
        <div>
          <div className="cc-eyebrow cc-eyebrow-soft">03 · Agentic State</div>
          <h2 className="mt-1 text-base font-semibold">
            Agent approval queue
          </h2>
        </div>
        <span className="cc-sigil-violet flex h-7 w-7 items-center justify-center rounded-lg">
          <Sparkles className="h-3.5 w-3.5" />
        </span>
      </header>
      <ul className="flex-1 space-y-2 px-3 py-3">
        {rows.map((r) => {
          const Icon = r.Icon;
          return (
            <li
              key={r.label}
              className="flex items-center gap-3 rounded-xl px-3 py-3"
              data-testid={`cc-agentic-${r.label}`}
            >
              <span
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                  r.tone === "amber" && "cc-sigil-amber",
                  r.tone === "violet" && "cc-sigil-violet",
                  r.tone === "teal" && "cc-sigil-teal",
                  r.tone === "grey" && "bg-white/[0.04]",
                )}
              >
                <Icon className="h-4 w-4" />
              </span>
              <span className="flex-1 text-sm font-medium">{r.label}</span>
              <span className="text-xl font-semibold tabular-nums">
                {r.value}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
