import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  DEFAULT_BLOCK_DAYS,
  DEFAULT_HOLD_HOURS,
  type UnitState,
} from "./transitions";

/**
 * D-420 — wrappers around the `transition_unit_state` and
 * `expire_inventory_holds` Postgres RPCs.
 *
 * The RPC is the single source of truth for state-machine validation, row
 * locking, and audit logging. This module is a thin typed shell around it.
 */

export type TransitionResult =
  | {
      ok: true;
      new_state: UnitState;
      from_state?: UnitState;
      state_expires_at: string | null;
      noop?: boolean;
    }
  | {
      ok: false;
      error:
        | "not_found"
        | "cross_tenant"
        | "unknown_state"
        | "illegal_transition"
        | "backward_no_override"
        | "rpc_error";
      message?: string;
      from_state?: UnitState;
      to_state?: UnitState;
    };

export type TransitionUnitStateArgs = {
  organization_id: string;
  unit_id: string;
  to_state: UnitState;
  actor_id: string;
  actor_role: string;
  reason?: string | null;
  has_override?: boolean;
  held_hours?: number;
  blocked_days?: number;
};

export async function transitionUnitState(
  args: TransitionUnitStateArgs,
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<TransitionResult> {
  const { data, error } = await client.rpc("transition_unit_state", {
    p_unit_id: args.unit_id,
    p_to_state: args.to_state,
    p_actor_id: args.actor_id,
    p_actor_role: args.actor_role,
    p_reason: args.reason ?? null,
    p_has_override: args.has_override ?? false,
    p_held_hours: args.held_hours ?? DEFAULT_HOLD_HOURS,
    p_blocked_days: args.blocked_days ?? DEFAULT_BLOCK_DAYS,
  });
  if (error) {
    return { ok: false, error: "rpc_error", message: error.message };
  }
  const result = (data ?? {}) as Record<string, unknown>;
  if (result.ok === true) {
    return {
      ok: true,
      new_state: result.new_state as UnitState,
      from_state:
        typeof result.from_state === "string"
          ? (result.from_state as UnitState)
          : undefined,
      state_expires_at:
        typeof result.state_expires_at === "string"
          ? (result.state_expires_at as string)
          : null,
      noop: result.noop === true,
    };
  }
  return {
    ok: false,
    error: (result.error as TransitionResult extends { ok: false; error: infer E }
      ? E
      : never) ?? "rpc_error",
    message: typeof result.message === "string" ? result.message : undefined,
    from_state:
      typeof result.from_state === "string"
        ? (result.from_state as UnitState)
        : undefined,
    to_state:
      typeof result.to_state === "string"
        ? (result.to_state as UnitState)
        : undefined,
  };
}

// ── Convenience wrappers ────────────────────────────────────────────────────
// Each takes the "actor context" and unit id; the to_state is hardcoded.
// `has_override` defaults to false; callers explicitly opt-in when invoking
// the override-revert path.

type ActorContext = Omit<
  TransitionUnitStateArgs,
  "to_state" | "has_override" | "reason"
> & { reason?: string | null; has_override?: boolean };

export const holdUnit = (a: ActorContext, c?: SupabaseClient) =>
  transitionUnitState({ ...a, to_state: "held" }, c);

export const blockUnit = (a: ActorContext, c?: SupabaseClient) =>
  transitionUnitState({ ...a, to_state: "blocked" }, c);

export const bookUnit = (a: ActorContext, c?: SupabaseClient) =>
  transitionUnitState({ ...a, to_state: "booked" }, c);

export const markSold = (a: ActorContext, c?: SupabaseClient) =>
  transitionUnitState({ ...a, to_state: "sold" }, c);

export const markRegistered = (a: ActorContext, c?: SupabaseClient) =>
  transitionUnitState({ ...a, to_state: "registered" }, c);

export const markPossessed = (a: ActorContext, c?: SupabaseClient) =>
  transitionUnitState({ ...a, to_state: "possessed" }, c);

export const releaseUnit = (a: ActorContext, c?: SupabaseClient) =>
  transitionUnitState({ ...a, to_state: "available" }, c);

// ── Hold-expiry RPC wrapper ─────────────────────────────────────────────────

export async function expireInventoryHolds(
  client: SupabaseClient = getSupabaseAdmin(),
  limit = 500,
): Promise<{ ok: true; expired: number } | { ok: false; error: string }> {
  const { data, error } = await client.rpc("expire_inventory_holds", {
    p_limit: limit,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, expired: typeof data === "number" ? data : 0 };
}
