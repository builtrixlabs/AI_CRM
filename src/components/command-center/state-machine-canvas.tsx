import { Mic, Heart, Brain, MessageSquare, Send, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type NodeState = "done" | "running" | "queued";

export type StateMachineNode = {
  id: string;
  index: string;
  title: string;
  caption: string;
  Icon: LucideIcon;
  state: NodeState;
};

type Props = {
  title?: string;
  subtitle?: string;
  nodes?: StateMachineNode[];
};

const DEFAULT_NODES: StateMachineNode[] = [
  { id: "1", index: "01", title: "Lead Ingested", caption: "Voice · Inbound", Icon: Mic, state: "done" },
  { id: "2", index: "02", title: "Sentiment Scored", caption: "0.86 positive", Icon: Heart, state: "done" },
  { id: "3", index: "03", title: "Intent Classified", caption: "High · 3BHK", Icon: Brain, state: "done" },
  { id: "4", index: "04", title: "Drafted WhatsApp", caption: "Tone matched", Icon: MessageSquare, state: "running" },
  { id: "5", index: "05", title: "Auto-Sent", caption: "ETA 24s", Icon: Send, state: "queued" },
];

export function StateMachineCanvas({
  title = "State machine · Lead 88421 · Rohit Menon",
  subtitle = "4 / 5 nodes",
  nodes = DEFAULT_NODES,
}: Props) {
  return (
    <section className="cc-card px-6 py-5">
      <header className="mb-6 flex items-start justify-between gap-3">
        <div>
          <div className="cc-eyebrow cc-eyebrow-soft">04 · Agentic Workflow HUD</div>
          <h2 className="mt-1 text-base font-semibold">{title}</h2>
        </div>
        <div className="flex items-center gap-3">
          <span className="cc-pill cc-pill-mint">running</span>
          <span className="cc-eyebrow cc-eyebrow-soft">{subtitle}</span>
        </div>
      </header>

      <div className="relative flex items-start justify-between gap-2 pt-4">
        {nodes.map((node, i) => (
          <NodeStep key={node.id} node={node} isLast={i === nodes.length - 1} />
        ))}
      </div>
    </section>
  );
}

function NodeStep({ node, isLast }: { node: StateMachineNode; isLast: boolean }) {
  const Icon = node.Icon;
  return (
    <div className="relative flex flex-1 flex-col items-center text-center">
      {!isLast && (
        <span
          aria-hidden="true"
          className="absolute top-7 h-px"
          style={{
            left: "calc(50% + 28px)",
            right: "calc(-50% + 28px)",
            background:
              node.state === "done"
                ? "var(--cc-teal-500)"
                : "rgba(255,255,255,0.08)",
          }}
        />
      )}
      <span
        className={cn(
          "relative z-10 flex h-14 w-14 items-center justify-center rounded-full border bg-[#0D1228]",
          node.state === "done" && "text-[var(--cc-teal-300)]",
          node.state === "running" && "text-[var(--cc-violet-300)]",
          node.state === "queued" && "text-muted-foreground"
        )}
        style={{
          borderColor:
            node.state === "done"
              ? "rgba(78,201,208,0.6)"
              : node.state === "running"
                ? "rgba(164,117,248,0.8)"
                : "rgba(255,255,255,0.08)",
          boxShadow:
            node.state === "running"
              ? "0 0 16px rgba(164,117,248,0.45)"
              : undefined,
        }}
      >
        <Icon className="h-5 w-5" />
        <span className="cc-pill cc-pill-grey absolute -top-2 right-0 text-[9px]">
          {node.index}
        </span>
      </span>
      <div className="mt-3 text-sm font-medium">{node.title}</div>
      <div className="cc-eyebrow cc-eyebrow-soft text-[9.5px]">{node.caption}</div>
    </div>
  );
}
