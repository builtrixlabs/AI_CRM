import type { UnitState } from "@/lib/inventory/transitions";
import { ALLOWED_FORWARD } from "@/lib/inventory/transitions";
import type { Permission } from "@/lib/auth/rbac";

/**
 * D-420 — server-rendered action menu for unit state transitions.
 *
 * Implementation note: shadcn/ui does not ship a dropdown-menu in this repo,
 * so the menu is a `<select>` of allowed forward transitions plus a submit
 * button. Forward transitions show under "Forward". Backward / non-adjacent
 * transitions appear when the caller has `catalog:admin_override` (gated by
 * the parent page rendering this twice — or with a checkbox to opt-in).
 *
 * Permission-to-target-state map (PRD v3.0 §3 P4, D-420 directive):
 *   - inventory:hold       → held
 *   - inventory:block      → blocked
 *   - inventory:book       → booked
 *   - inventory:sell       → sold
 *   - inventory:register   → registered
 *   - inventory:possess    → possessed
 *   - properties:release   → available (release from held/blocked)
 *
 * The caller passes a Set of permissions; the menu filters its options.
 */

export const TRANSITION_PERM_MAP: Record<UnitState, Permission | null> = {
  available: "properties:release",
  held: "inventory:hold",
  blocked: "inventory:block",
  booked: "inventory:book",
  sold: "inventory:sell",
  registered: "inventory:register",
  possessed: "inventory:possess",
};

export function allowedTransitionsForCaller(
  current: UnitState,
  perms: Set<Permission>,
  has_override: boolean,
): UnitState[] {
  // Forward set per ALLOWED_FORWARD, filtered by perm.
  const forward = ALLOWED_FORWARD[current].filter((to) => {
    if (to === current) return false;
    const perm = TRANSITION_PERM_MAP[to];
    if (!perm) return true;
    return perms.has(perm);
  });
  if (!has_override) return forward;

  // With override: surface ALL transitions to non-current states.
  const all: UnitState[] = (
    ["available", "held", "blocked", "booked", "sold", "registered", "possessed"] as UnitState[]
  ).filter((to) => to !== current);
  const set = new Set([...forward, ...all]);
  return Array.from(set);
}

export function UnitStateActionMenu({
  unit_id,
  current_state,
  caller_perms,
  has_override,
  formAction,
}: {
  unit_id: string;
  current_state: UnitState;
  caller_perms: Set<Permission>;
  has_override: boolean;
  formAction: (formData: FormData) => Promise<void>;
}) {
  const options = allowedTransitionsForCaller(
    current_state,
    caller_perms,
    has_override,
  );
  if (options.length === 0) {
    return (
      <span
        className="text-xs text-neutral-400"
        data-testid={`unit-action-menu-${unit_id}-empty`}
      >
        no actions
      </span>
    );
  }
  return (
    <form
      action={formAction}
      className="flex items-center gap-1.5"
      data-testid={`unit-action-form-${unit_id}`}
    >
      <input type="hidden" name="intent" value="transition" />
      <input type="hidden" name="unit_id" value={unit_id} />
      <select
        name="to_state"
        defaultValue={options[0]}
        className="rounded border border-neutral-300 bg-white text-xs px-1.5 py-1"
        data-testid={`unit-action-select-${unit_id}`}
      >
        {options.map((s) => (
          <option key={s} value={s}>
            → {s}
          </option>
        ))}
      </select>
      {has_override && (
        <label className="text-[10px] text-neutral-500 flex items-center gap-1">
          <input
            type="checkbox"
            name="has_override"
            value="1"
            data-testid={`unit-action-override-${unit_id}`}
          />
          override
        </label>
      )}
      <button
        type="submit"
        className="rounded bg-neutral-900 text-white text-xs px-2 py-1"
        data-testid={`unit-action-submit-${unit_id}`}
      >
        Apply
      </button>
    </form>
  );
}
