import type { UnitState } from "@/lib/inventory/transitions";

/**
 * D-420 — Color tints for the 7-state availability machine.
 *
 * Re-rendered server-side; pure presentational component. Hold / Block
 * states display a countdown chip when `state_expires_at` is set.
 */

const STATE_TINT: Record<UnitState, string> = {
  available: "bg-emerald-100 text-emerald-900 border-emerald-200",
  held: "bg-amber-100 text-amber-900 border-amber-200",
  blocked: "bg-orange-100 text-orange-900 border-orange-200",
  booked: "bg-blue-100 text-blue-900 border-blue-200",
  sold: "bg-purple-100 text-purple-900 border-purple-200",
  registered: "bg-indigo-100 text-indigo-900 border-indigo-200",
  possessed: "bg-neutral-200 text-neutral-700 border-neutral-300",
};

function formatExpiry(state_expires_at: string): string {
  const target = new Date(state_expires_at).getTime();
  if (!Number.isFinite(target)) return "";
  const ms = target - Date.now();
  if (ms <= 0) return "expired";
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `expires in ${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `expires in ${hours}h`;
  const days = Math.round(hours / 24);
  return `expires in ${days}d`;
}

export function UnitStateBadge({
  state,
  state_expires_at,
}: {
  state: UnitState;
  state_expires_at?: string | null;
}) {
  const tint = STATE_TINT[state];
  const showCountdown =
    (state === "held" || state === "blocked") && state_expires_at;
  return (
    <span
      data-testid={`unit-state-badge-${state}`}
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium ${tint}`}
    >
      {state}
      {showCountdown ? (
        <span
          className="text-[10px] font-normal opacity-80"
          data-testid="unit-state-countdown"
        >
          · {formatExpiry(state_expires_at!)}
        </span>
      ) : null}
    </span>
  );
}
