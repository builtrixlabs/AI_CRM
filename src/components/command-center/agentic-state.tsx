import { MessagesSquare, PhoneOutgoing, Sparkles, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "violet" | "teal" | "mint";

type Orchestration = {
  id: string;
  title: string;
  caption: string;
  pct: number;
  tone: Tone;
  Icon: LucideIcon;
};

const ITEMS: Orchestration[] = [
  {
    id: "1",
    title: "Drafting WhatsApp follow-ups",
    caption: "12 / 12 · in 24s",
    pct: 100,
    tone: "violet",
    Icon: MessagesSquare,
  },
  {
    id: "2",
    title: "Voice callbacks queued",
    caption: "38 / 60 · running",
    pct: 63,
    tone: "teal",
    Icon: PhoneOutgoing,
  },
  {
    id: "3",
    title: "Re-scoring 4,212 stale leads",
    caption: "2,840 / 4,212 · 8m",
    pct: 67,
    tone: "mint",
    Icon: Sparkles,
  },
];

export function AgenticState() {
  return (
    <section className="cc-card flex h-full flex-col overflow-hidden">
      <header className="flex items-start justify-between border-b border-white/[0.04] px-5 py-4">
        <div>
          <div className="cc-eyebrow cc-eyebrow-soft">03 · Agentic State</div>
          <h2 className="mt-1 text-base font-semibold">Active orchestrations</h2>
        </div>
        <span className="cc-sigil-violet flex h-7 w-7 items-center justify-center rounded-lg">
          <Sparkles className="h-3.5 w-3.5" />
        </span>
      </header>
      <ul className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
        {ITEMS.map((item) => (
          <OrchestrationRow key={item.id} item={item} />
        ))}
      </ul>
      <footer className="grid grid-cols-3 gap-3 border-t border-white/[0.04] px-5 py-3 text-center">
        <Stat label="leads" value="104,238" />
        <Stat label="agents" value="12" />
        <Stat label="in pipeline" value="$2.1M" />
      </footer>
    </section>
  );
}

function OrchestrationRow({ item }: { item: Orchestration }) {
  const Icon = item.Icon;
  return (
    <li className="rounded-xl px-3 py-3 transition-colors hover:bg-white/[0.02]">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
            item.tone === "violet" && "cc-sigil-violet",
            item.tone === "teal" && "cc-sigil-teal",
            item.tone === "mint" && "cc-sigil-teal"
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <div className="truncate text-sm font-medium">{item.title}</div>
            <span className="cc-eyebrow text-foreground/85 tabular-nums">{item.pct}%</span>
          </div>
          <div className="truncate text-xs text-muted-foreground">{item.caption}</div>
          <div className="cc-bar-track mt-2 h-1">
            <div
              className={cn(
                "h-full",
                item.tone === "violet" && "cc-bar-fill-teal",
                item.tone === "teal" && "cc-bar-fill-mint",
                item.tone === "mint" && "cc-bar-fill-mint"
              )}
              style={{ width: `${item.pct}%` }}
            />
          </div>
        </div>
      </div>
    </li>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-base font-semibold tabular-nums">{value}</div>
      <div className="cc-eyebrow cc-eyebrow-soft text-[9px]">{label}</div>
    </div>
  );
}
