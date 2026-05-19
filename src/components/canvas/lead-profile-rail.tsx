import { Calendar, Hash, Mail, MapPin, Phone, Tag, User2 } from "lucide-react";
import type { CanvasLead } from "@/lib/canvas/types";

type Props = {
  lead: CanvasLead;
  /** Initials shown in the avatar circle. Defaults to first 2 chars of label. */
  initials?: string;
  /** Owner display name + role, if resolved by the page. */
  ownerName?: string | null;
  ownerRole?: string | null;
};

/**
 * v6.2.2 — Lead profile left rail. Replaces the prior "header at top
 * only" canvas affordance with a sticky 320px column containing identity,
 * contact, source/stage, intent score, ownership, and key timestamps.
 *
 * Sparse leads (no name, no contact) get a graceful empty-state hint so
 * the rail never looks broken.
 */
export function LeadProfileRail({
  lead,
  initials,
  ownerName,
  ownerRole,
}: Props) {
  const data = lead.data as Record<string, unknown>;
  const name = pickString(data, "name") ?? pickString(data, "full_name");
  const phone = pickString(data, "phone");
  const email = pickString(data, "email");
  const source = pickString(data, "source");
  const intent = pickNumber(data, "intent_score");
  const project = pickString(data, "project") ?? pickString(data, "project_name");
  const displayLabel = name ?? prettyId(lead.label);
  const initialsResolved = initials ?? deriveInitials(name ?? lead.label);

  return (
    <aside
      className="bcmd-card flex flex-col gap-5 p-5"
      data-testid="lead-profile-rail"
      aria-label="Lead profile"
    >
      <div className="flex flex-col items-center text-center">
        <span
          className="bcmd-sidebar-user-avatar"
          style={{ width: 64, height: 64, fontSize: 22 }}
          aria-hidden="true"
        >
          {initialsResolved}
        </span>
        <h2
          className="mt-3 font-display text-[17px] font-semibold leading-tight text-[var(--fg1)]"
          data-testid="lead-profile-name"
        >
          {displayLabel}
        </h2>
        <div className="mt-1 flex items-center gap-2">
          <StageBadge state={lead.state} />
          {intent != null ? <IntentChip score={intent} /> : null}
        </div>
      </div>

      <RailSection title="Contact">
        <RailItem
          Icon={Phone}
          label="Phone"
          value={phone}
          href={phone ? `tel:${phone}` : undefined}
          empty="Not captured"
        />
        <RailItem
          Icon={Mail}
          label="Email"
          value={email}
          href={email ? `mailto:${email}` : undefined}
          empty="Not captured"
        />
      </RailSection>

      <RailSection title="Lead context">
        <RailItem Icon={Tag} label="Source" value={source} empty="Unknown" />
        <RailItem
          Icon={MapPin}
          label="Project"
          value={project}
          empty="No project linked"
        />
        <RailItem
          Icon={Hash}
          label="Lead ID"
          value={prettyId(lead.id)}
          mono
        />
      </RailSection>

      <RailSection title="Ownership">
        <RailItem
          Icon={User2}
          label="Owner"
          value={ownerName ?? "Unassigned"}
          subtitle={ownerRole ?? undefined}
        />
        <RailItem
          Icon={Calendar}
          label="Created"
          value={formatDate(lead.created_at)}
          subtitle={`Updated ${formatDate(lead.updated_at)}`}
          mono
        />
      </RailSection>
    </aside>
  );
}

function RailSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="font-display text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--amethyst-700)]">
        {title}
      </h3>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  );
}

function RailItem({
  Icon,
  label,
  value,
  href,
  empty,
  mono,
  subtitle,
}: {
  Icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
  value: string | null | undefined;
  href?: string;
  empty?: string;
  mono?: boolean;
  subtitle?: string;
}) {
  const hasValue = typeof value === "string" && value.trim() !== "";
  const display = hasValue ? value : empty ?? "—";
  const fontClass = mono ? "font-mono text-[12px]" : "font-sans text-[13px]";
  const colorClass = hasValue ? "text-[var(--fg1)]" : "text-[var(--fg3)]";
  return (
    <div className="flex items-start gap-2.5">
      <Icon
        aria-hidden={true}
        className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--fg3)]"
      />
      <div className="min-w-0 flex-1">
        <div className="font-display text-[10px] font-semibold uppercase tracking-wider text-[var(--fg3)]">
          {label}
        </div>
        {href && hasValue ? (
          <a
            href={href}
            className={`block truncate ${fontClass} font-semibold text-[var(--amethyst-700)] underline-offset-2 hover:underline`}
            data-testid={`rail-${label.toLowerCase()}-link`}
          >
            {display}
          </a>
        ) : (
          <div
            className={`truncate ${fontClass} ${colorClass} ${hasValue ? "font-medium" : "italic"}`}
          >
            {display}
          </div>
        )}
        {subtitle ? (
          <div className="mt-0.5 font-sans text-[11px] text-[var(--fg3)] truncate">
            {subtitle}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function StageBadge({ state }: { state: string }) {
  const tone = stageTone(state);
  return (
    <span
      data-testid="lead-stage-badge"
      style={{
        padding: "3px 10px",
        borderRadius: 999,
        background: tone[0],
        color: tone[1],
        fontFamily: "var(--font-display)",
        fontSize: 11,
        fontWeight: 600,
      }}
    >
      {prettyStage(state)}
    </span>
  );
}

function IntentChip({ score }: { score: number }) {
  const tone = intentTone(score);
  return (
    <span
      data-testid="lead-intent-chip"
      style={{
        padding: "3px 8px",
        borderRadius: 999,
        background: tone[0],
        color: tone[1],
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.02em",
      }}
    >
      Intent {score}
    </span>
  );
}

function intentTone(score: number): [string, string] {
  if (score >= 70) return ["var(--copper-100)", "var(--copper-800)"];
  if (score >= 40) return ["var(--amethyst-100)", "var(--amethyst-800)"];
  return ["var(--slate-100)", "var(--slate-700)"];
}

function stageTone(state: string): [string, string] {
  const normalised = state.toLowerCase();
  const map: Record<string, [string, string]> = {
    new: ["var(--indigo-100)", "var(--indigo-700)"],
    contacted: ["var(--amethyst-100)", "var(--amethyst-800)"],
    qualified: ["var(--copper-100)", "var(--copper-800)"],
    lost: ["#FBECEC", "#C84B4B"],
    junk: ["var(--slate-100)", "var(--slate-700)"],
    on_hold: ["#FBF3DC", "#876818"],
  };
  return map[normalised] ?? ["var(--slate-100)", "var(--slate-700)"];
}

function prettyStage(state: string): string {
  return state
    .replace(/_/g, " ")
    .split(" ")
    .map((p) => (p ? p[0].toUpperCase() + p.slice(1) : p))
    .join(" ");
}

function prettyId(id: string): string {
  if (!id) return "—";
  if (id.length <= 12) return id;
  return `${id.slice(0, 8)}…${id.slice(-4)}`;
}

function deriveInitials(label: string): string {
  if (!label) return "··";
  // Hex-like ID — use first 2 chars uppercased; not the most beautiful but
  // distinct per lead and stable.
  if (/^[0-9a-f]{2,}/i.test(label) && !/\s/.test(label)) {
    return label.slice(0, 2).toUpperCase();
  }
  const parts = label.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function pickString(
  data: Record<string, unknown>,
  key: string,
): string | undefined {
  const v = data[key];
  if (typeof v !== "string") return undefined;
  const trimmed = v.trim();
  return trimmed === "" ? undefined : trimmed;
}

function pickNumber(
  data: Record<string, unknown>,
  key: string,
): number | undefined {
  const v = data[key];
  if (typeof v !== "number" || !Number.isFinite(v)) return undefined;
  return v;
}

// Re-export pure helpers for tests
export const __testing = {
  prettyStage,
  prettyId,
  deriveInitials,
  intentTone,
};
