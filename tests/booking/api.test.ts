import { describe, expect, it, vi } from "vitest";
import { getDealBookingState } from "@/lib/booking/api";

type Row = Record<string, unknown>;

function buildClient(opts: {
  dealRow: Row | null;
  transitionRows: Row[];
}) {
  // Chainable mock matching the supabase-js builder API used in api.ts.
  // The first chain ends with .maybeSingle(); the second ends with .order().
  const dealChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: opts.dealRow, error: null }),
  };
  const transitionChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: opts.transitionRows, error: null }),
  };
  return {
    from: vi.fn((table: string) => {
      if (table === "nodes") return dealChain;
      if (table === "stage_transitions") return transitionChain;
      throw new Error(`unexpected table ${table}`);
    }),
  } as unknown as Parameters<typeof getDealBookingState>[1];
}

describe("getDealBookingState", () => {
  it("returns currentStage='eoi' + transitions list for a known deal", async () => {
    const client = buildClient({
      dealRow: { id: "d1", current_stage: "eoi", node_type: "deal" },
      transitionRows: [
        {
          id: "t1",
          deal_id: "d1",
          organization_id: "o1",
          from_stage: null,
          to_stage: "eoi",
          actor_user_id: null,
          actor_kind: "system",
          triggered_by: "migration:20260511220000",
          evidence: { backfill: true },
          idempotency_key: "k1",
          skip_reason: null,
          correction_reason: null,
          occurred_at: "2026-05-11T00:00:00Z",
        },
      ],
    });
    const r = await getDealBookingState("d1", client);
    expect(r.currentStage).toBe("eoi");
    expect(r.transitions).toHaveLength(1);
    expect(r.transitions[0]?.from_stage).toBe(null);
    expect(r.transitions[0]?.to_stage).toBe("eoi");
    expect(r.transitions[0]?.actor_kind).toBe("system");
    expect(r.transitions[0]?.evidence).toEqual({ backfill: true });
  });

  it("returns currentStage=null + empty transitions when deal is missing", async () => {
    const client = buildClient({ dealRow: null, transitionRows: [] });
    const r = await getDealBookingState("missing", client);
    expect(r.currentStage).toBe(null);
    expect(r.transitions).toEqual([]);
  });

  it("falls back to 'eoi' to_stage when the row's to_stage is malformed", async () => {
    const client = buildClient({
      dealRow: { id: "d1", current_stage: "token", node_type: "deal" },
      transitionRows: [
        {
          id: "t2",
          deal_id: "d1",
          organization_id: "o1",
          from_stage: "eoi",
          to_stage: "not_a_real_stage",
          actor_user_id: "u1",
          actor_kind: "user",
          triggered_by: "manual",
          evidence: { receipt: "X" },
          idempotency_key: "k2",
          skip_reason: null,
          correction_reason: null,
          occurred_at: "2026-05-11T01:00:00Z",
        },
      ],
    });
    const r = await getDealBookingState("d1", client);
    expect(r.currentStage).toBe("token");
    // Malformed to_stage falls back to 'eoi' (defensive parsing).
    expect(r.transitions[0]?.to_stage).toBe("eoi");
  });

  it("rejects malformed current_stage as null", async () => {
    const client = buildClient({
      dealRow: { id: "d1", current_stage: "bogus", node_type: "deal" },
      transitionRows: [],
    });
    const r = await getDealBookingState("d1", client);
    expect(r.currentStage).toBe(null);
  });
});
