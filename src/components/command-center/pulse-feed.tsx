import { Phone, MessageSquare, Mic, Mail, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type PulseChannel = "voice" | "whatsapp" | "voice_note" | "email";
type PillTone = "teal" | "violet" | "mint" | "amber" | "hot";

type PulseEntry = {
  id: string;
  channel: PulseChannel;
  title: string;
  subtitle: string;
  ago: string;
  pills: Array<{ label: string; tone: PillTone }>;
};

const ENTRIES: PulseEntry[] = [
  {
    id: "1",
    channel: "voice",
    title: "Listener · Inbound Call",
    subtitle: "Rohit Menon → +91 98••• 4421",
    ago: "12s ago",
    pills: [
      { label: "Budget: ₹1.6Cr", tone: "teal" },
      { label: "BHK: 3", tone: "teal" },
      { label: "Intent: High", tone: "violet" },
    ],
  },
  {
    id: "2",
    channel: "whatsapp",
    title: "Listener · WhatsApp",
    subtitle: "Divya Krishnan → Casagrand ECR",
    ago: "48s ago",
    pills: [
      { label: "Timeline: Q3 2026", tone: "teal" },
      { label: "Loan: Pre-approved", tone: "mint" },
    ],
  },
  {
    id: "3",
    channel: "voice_note",
    title: "Listener · Site Visit Voice Note",
    subtitle: "Agent Priya · Nanganallur",
    ago: "2m ago",
    pills: [
      { label: "Sentiment: Positive", tone: "mint" },
      { label: "Objection: Parking", tone: "amber" },
    ],
  },
  {
    id: "4",
    channel: "email",
    title: "Listener · Email Reply",
    subtitle: "vikram.s@… · re: Floor plan",
    ago: "4m ago",
    pills: [
      { label: "Stage: Negotiation", tone: "violet" },
      { label: "Sentiment: Neutral", tone: "teal" },
    ],
  },
];

const CHANNEL_ICON: Record<PulseChannel, LucideIcon> = {
  voice: Phone,
  whatsapp: MessageSquare,
  voice_note: Mic,
  email: Mail,
};

export function PulseFeed() {
  return (
    <section className="cc-card flex h-full flex-col overflow-hidden">
      <header className="flex items-start justify-between border-b border-white/[0.04] px-5 py-4">
        <div>
          <div className="cc-eyebrow cc-eyebrow-soft">01 · The Pulse</div>
          <h2 className="mt-1 text-base font-semibold">Listeners parsing in real time</h2>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="cc-live-dot" aria-hidden="true" />
          <span className="tabular-nums">47 / sec</span>
        </div>
      </header>
      <ul aria-label="Live activity feed" className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
        {ENTRIES.map((entry) => (
          <PulseEntryRow key={entry.id} entry={entry} />
        ))}
      </ul>
    </section>
  );
}

function PulseEntryRow({ entry }: { entry: PulseEntry }) {
  const Icon = CHANNEL_ICON[entry.channel];
  return (
    <li className="flex items-start gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-white/[0.02]">
      <span className="cc-sigil-violet flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{entry.title}</div>
            <div className="truncate text-xs text-muted-foreground">{entry.subtitle}</div>
          </div>
          <div className="cc-eyebrow cc-eyebrow-soft shrink-0">{entry.ago}</div>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {entry.pills.map((pill) => (
            <span key={pill.label} className={cn("cc-pill", `cc-pill-${pill.tone}`)}>
              {pill.label}
            </span>
          ))}
        </div>
      </div>
    </li>
  );
}
