import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  blockUnit,
  bookUnit,
  expireInventoryHolds,
  holdUnit,
  markPossessed,
  markRegistered,
  markSold,
  releaseUnit,
  transitionUnitState,
} from "@/lib/inventory/state-api";

const ORG = "11111111-2222-4333-8444-555555555555";
const UNIT = "33333333-4444-4555-8666-777777777777";
const ACTOR = "44444444-5555-4555-8666-888888888888";

function makeRpcClient(response: {
  data?: unknown;
  error?: { message: string } | null;
  capture?: { name?: string; params?: Record<string, unknown> };
}): SupabaseClient {
  const capture = response.capture ?? {};
  return {
    rpc: (name: string, params: Record<string, unknown>) => {
      capture.name = name;
      capture.params = params;
      return Promise.resolve({
        data: response.data ?? null,
        error: response.error ?? null,
      });
    },
  } as unknown as SupabaseClient;
}

describe("transitionUnitState — happy path", () => {
  it("returns ok with new_state + state_expires_at", async () => {
    const capture: { name?: string; params?: Record<string, unknown> } = {};
    const c = makeRpcClient({
      data: {
        ok: true,
        new_state: "held",
        from_state: "available",
        state_expires_at: "2026-05-12T00:00:00Z",
      },
      capture,
    });
    const r = await transitionUnitState(
      {
        organization_id: ORG,
        unit_id: UNIT,
        to_state: "held",
        actor_id: ACTOR,
        actor_role: "sales_rep",
      },
      c,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.new_state).toBe("held");
      expect(r.from_state).toBe("available");
      expect(r.state_expires_at).toBe("2026-05-12T00:00:00Z");
    }
    expect(capture.name).toBe("transition_unit_state");
    expect(capture.params?.p_unit_id).toBe(UNIT);
    expect(capture.params?.p_to_state).toBe("held");
    expect(capture.params?.p_has_override).toBe(false);
    expect(capture.params?.p_held_hours).toBe(24);
    expect(capture.params?.p_blocked_days).toBe(7);
  });

  it("noop flag is propagated", async () => {
    const c = makeRpcClient({
      data: {
        ok: true,
        new_state: "available",
        state_expires_at: null,
        noop: true,
      },
    });
    const r = await transitionUnitState(
      {
        organization_id: ORG,
        unit_id: UNIT,
        to_state: "available",
        actor_id: ACTOR,
        actor_role: "sales_rep",
      },
      c,
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.noop).toBe(true);
  });
});

describe("transitionUnitState — error paths", () => {
  it("rpc-level error → ok=false, error='rpc_error'", async () => {
    const c = makeRpcClient({ error: { message: "connection lost" } });
    const r = await transitionUnitState(
      {
        organization_id: ORG,
        unit_id: UNIT,
        to_state: "held",
        actor_id: ACTOR,
        actor_role: "sales_rep",
      },
      c,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe("rpc_error");
      expect(r.message).toBe("connection lost");
    }
  });

  it("RPC returns illegal_transition", async () => {
    const c = makeRpcClient({
      data: {
        ok: false,
        error: "illegal_transition",
        from_state: "available",
        to_state: "sold",
      },
    });
    const r = await transitionUnitState(
      {
        organization_id: ORG,
        unit_id: UNIT,
        to_state: "sold",
        actor_id: ACTOR,
        actor_role: "sales_rep",
      },
      c,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe("illegal_transition");
      expect(r.from_state).toBe("available");
      expect(r.to_state).toBe("sold");
    }
  });

  it("RPC returns backward_no_override", async () => {
    const c = makeRpcClient({
      data: { ok: false, error: "backward_no_override" },
    });
    const r = await transitionUnitState(
      {
        organization_id: ORG,
        unit_id: UNIT,
        to_state: "available",
        actor_id: ACTOR,
        actor_role: "sales_rep",
      },
      c,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("backward_no_override");
  });

  it("RPC returns cross_tenant", async () => {
    const c = makeRpcClient({ data: { ok: false, error: "cross_tenant" } });
    const r = await transitionUnitState(
      {
        organization_id: ORG,
        unit_id: UNIT,
        to_state: "held",
        actor_id: ACTOR,
        actor_role: "sales_rep",
      },
      c,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("cross_tenant");
  });

  it("RPC returns not_found", async () => {
    const c = makeRpcClient({ data: { ok: false, error: "not_found" } });
    const r = await transitionUnitState(
      {
        organization_id: ORG,
        unit_id: UNIT,
        to_state: "held",
        actor_id: ACTOR,
        actor_role: "sales_rep",
      },
      c,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("not_found");
  });
});

describe("transitionUnitState — has_override + TTL params", () => {
  it("passes has_override=true through", async () => {
    const capture: { params?: Record<string, unknown> } = {};
    const c = makeRpcClient({
      data: { ok: true, new_state: "available", state_expires_at: null },
      capture,
    });
    await transitionUnitState(
      {
        organization_id: ORG,
        unit_id: UNIT,
        to_state: "available",
        actor_id: ACTOR,
        actor_role: "org_admin",
        has_override: true,
      },
      c,
    );
    expect(capture.params?.p_has_override).toBe(true);
  });

  it("passes custom TTL params through", async () => {
    const capture: { params?: Record<string, unknown> } = {};
    const c = makeRpcClient({
      data: {
        ok: true,
        new_state: "held",
        state_expires_at: "2026-05-12T00:00:00Z",
      },
      capture,
    });
    await transitionUnitState(
      {
        organization_id: ORG,
        unit_id: UNIT,
        to_state: "held",
        actor_id: ACTOR,
        actor_role: "sales_rep",
        held_hours: 48,
        blocked_days: 14,
      },
      c,
    );
    expect(capture.params?.p_held_hours).toBe(48);
    expect(capture.params?.p_blocked_days).toBe(14);
  });
});

describe("Convenience wrappers map to correct to_state", () => {
  const ok = (state: string) => ({
    data: {
      ok: true,
      new_state: state,
      state_expires_at: state === "held" || state === "blocked"
        ? "2026-05-12T00:00:00Z"
        : null,
    },
  });

  it("holdUnit → 'held'", async () => {
    const capture: { params?: Record<string, unknown> } = {};
    await holdUnit(
      {
        organization_id: ORG,
        unit_id: UNIT,
        actor_id: ACTOR,
        actor_role: "sales_rep",
      },
      makeRpcClient({ ...ok("held"), capture }),
    );
    expect(capture.params?.p_to_state).toBe("held");
  });

  it("blockUnit → 'blocked'", async () => {
    const capture: { params?: Record<string, unknown> } = {};
    await blockUnit(
      {
        organization_id: ORG,
        unit_id: UNIT,
        actor_id: ACTOR,
        actor_role: "manager",
      },
      makeRpcClient({ ...ok("blocked"), capture }),
    );
    expect(capture.params?.p_to_state).toBe("blocked");
  });

  it("bookUnit → 'booked'", async () => {
    const capture: { params?: Record<string, unknown> } = {};
    await bookUnit(
      {
        organization_id: ORG,
        unit_id: UNIT,
        actor_id: ACTOR,
        actor_role: "workspace_admin",
      },
      makeRpcClient({ ...ok("booked"), capture }),
    );
    expect(capture.params?.p_to_state).toBe("booked");
  });

  it("markSold → 'sold'", async () => {
    const capture: { params?: Record<string, unknown> } = {};
    await markSold(
      {
        organization_id: ORG,
        unit_id: UNIT,
        actor_id: ACTOR,
        actor_role: "workspace_admin",
      },
      makeRpcClient({ ...ok("sold"), capture }),
    );
    expect(capture.params?.p_to_state).toBe("sold");
  });

  it("markRegistered → 'registered'", async () => {
    const capture: { params?: Record<string, unknown> } = {};
    await markRegistered(
      {
        organization_id: ORG,
        unit_id: UNIT,
        actor_id: ACTOR,
        actor_role: "workspace_admin",
      },
      makeRpcClient({ ...ok("registered"), capture }),
    );
    expect(capture.params?.p_to_state).toBe("registered");
  });

  it("markPossessed → 'possessed'", async () => {
    const capture: { params?: Record<string, unknown> } = {};
    await markPossessed(
      {
        organization_id: ORG,
        unit_id: UNIT,
        actor_id: ACTOR,
        actor_role: "workspace_admin",
      },
      makeRpcClient({ ...ok("possessed"), capture }),
    );
    expect(capture.params?.p_to_state).toBe("possessed");
  });

  it("releaseUnit → 'available'", async () => {
    const capture: { params?: Record<string, unknown> } = {};
    await releaseUnit(
      {
        organization_id: ORG,
        unit_id: UNIT,
        actor_id: ACTOR,
        actor_role: "sales_rep",
      },
      makeRpcClient({ ...ok("available"), capture }),
    );
    expect(capture.params?.p_to_state).toBe("available");
  });
});

describe("expireInventoryHolds", () => {
  it("returns expired count on success", async () => {
    const c = makeRpcClient({ data: 7 });
    const r = await expireInventoryHolds(c);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.expired).toBe(7);
  });

  it("returns error on RPC failure", async () => {
    const c = makeRpcClient({ error: { message: "permission denied" } });
    const r = await expireInventoryHolds(c);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("permission denied");
  });

  it("zero when data null", async () => {
    const c = makeRpcClient({ data: null });
    const r = await expireInventoryHolds(c);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.expired).toBe(0);
  });
});
