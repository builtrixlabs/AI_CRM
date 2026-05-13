import { Check, AlertTriangle, Circle, Clock } from "lucide-react";
import type { ChannelStatus } from "@/lib/integrations/health";

type Props = {
  status: ChannelStatus;
  detail?: string;
};

const STATUS_LABEL: Record<ChannelStatus, string> = {
  healthy: "Healthy",
  warning: "Degraded",
  not_configured: "Not configured",
  unavailable: "Coming soon",
};

const STATUS_COLOR: Record<ChannelStatus, string> = {
  healthy: "var(--cc-mint-700)",
  warning: "var(--copper-700)",
  not_configured: "var(--slate-500)",
  unavailable: "var(--slate-400)",
};

const STATUS_BG: Record<ChannelStatus, string> = {
  healthy: "color-mix(in oklch, var(--cc-mint-500) 14%, transparent)",
  warning: "color-mix(in oklch, var(--copper-500) 14%, transparent)",
  not_configured: "color-mix(in oklch, var(--slate-500) 10%, transparent)",
  unavailable: "color-mix(in oklch, var(--slate-400) 8%, transparent)",
};

/**
 * D-439 — small status badge for the /admin/integrations index tiles.
 * Surfaces the `(is_configured, is_active, test_ping_ok)` triple each
 * channel maintains as one of ✓ healthy · ⚠ degraded · ⚪ not configured ·
 * — coming soon. Tooltip detail is included in the title attribute for
 * accessibility (no JS-only hover popup).
 */
export function IntegrationHealthBadge({ status, detail }: Props) {
  const Icon =
    status === "healthy"
      ? Check
      : status === "warning"
        ? AlertTriangle
        : status === "not_configured"
          ? Circle
          : Clock;
  const label = STATUS_LABEL[status];
  return (
    <span
      data-testid={`integration-health-${status}`}
      title={detail ? `${label} — ${detail}` : label}
      className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium"
      style={{
        color: STATUS_COLOR[status],
        borderColor: `color-mix(in oklch, ${STATUS_COLOR[status]} 28%, transparent)`,
        background: STATUS_BG[status],
      }}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {label}
    </span>
  );
}
