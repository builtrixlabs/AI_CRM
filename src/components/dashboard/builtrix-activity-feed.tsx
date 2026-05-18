import { MessageSquare, PhoneCall, Mail, MapPin, Sparkles, type LucideIcon } from "lucide-react";
import type { CcPulseActivity } from "@/lib/command-center/data";

const CHANNEL_ICON: Record<string, LucideIcon> = {
  call: PhoneCall,
  voice: PhoneCall,
  whatsapp: MessageSquare,
  sms: MessageSquare,
  email: Mail,
  in_person: MapPin,
  visit: MapPin,
};

type Props = {
  title?: string;
  subtitle?: string;
  activities: readonly CcPulseActivity[];
  emptyHint?: string;
  limit?: number;
};

export function BuiltrixActivityFeed({
  title = "Recent activity",
  subtitle = "Live from VoiceIQ + Flow",
  activities,
  emptyHint = "No recent activity.",
  limit = 8,
}: Props) {
  const shown = activities.slice(0, limit);
  return (
    <section className="bcmd-card" data-testid="bcmd-activity-feed">
      <header className="bcmd-section-header">
        <div>
          <h3 className="bcmd-section-title">{title}</h3>
          <p className="bcmd-section-subtitle">{subtitle}</p>
        </div>
      </header>
      {shown.length === 0 ? (
        <div className="px-6 py-10 text-center font-sans text-sm text-[var(--fg3)]">
          {emptyHint}
        </div>
      ) : (
        <ul className="divide-y divide-[var(--border-subtle)]">
          {shown.map((a) => {
            const channel = (a.channel ?? "").toLowerCase();
            const Icon = CHANNEL_ICON[channel] ?? Sparkles;
            return (
              <li
                key={a.id}
                className="flex items-start gap-3 px-6 py-3.5 transition-colors hover:bg-[var(--cloud-50)]"
              >
                <span
                  className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                  style={{
                    background: "var(--amethyst-100)",
                    color: "var(--amethyst-700)",
                  }}
                  aria-hidden="true"
                >
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-display text-[13px] font-semibold text-[var(--fg1)] truncate">
                    {a.label}
                  </div>
                  <div className="mt-0.5 font-sans text-[11px] text-[var(--fg3)]">
                    {formatRelative(a.created_at)} · via {a.created_via}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "just now";
  const diff = Date.now() - then;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Intl.DateTimeFormat("en-IN", {
    month: "short",
    day: "numeric",
  }).format(new Date(iso));
}
