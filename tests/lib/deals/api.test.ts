import { describe, expect, it, vi } from "vitest";
import {
  getDealCanvas,
  isDealStage,
  promoteLeadToDeal,
} from "@/lib/deals/api";

const ORG = "11111111-2222-4333-8444-555555555555";
const WS = "22222222-3333-4444-8555-666666666666";
const DEAL = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const LEAD = "ffffffff-eeee-4ddd-8ccc-bbbbbbbbbbbb";
const USER = "99999999-8888-4777-8666-555555555555";

describe("isDealStage", () => {
  it.each([
    ["qualified", true],
    ["site_visit_scheduled", true],
    ["site_visit_done", true],
    ["negotiation", true],
    ["booked", true],
    ["lost", true],
    ["weird", false],
    [42, false],
    [null, false],
  ])("%s -> %s", (v, expected) => {
    expect(isDealStage(v)).toBe(expected);
  });
});

function makeCanvasClient(opts: {
  deal?: {
    id: string;
    organization_id: string;
    workspace_id: string;
    label: string;
    state: string | null;
    data: unknown;
    created_at: string;
    updated_at: string;
  } | null;
  edges?: Array<{ from_node_id: string; to_node_id: string }>;
  neighbours?: Array<{
    id: string;
    node_type: string;
    label: string;
    state?: string | null;
    data?: Record<string, unknown> | null;
    created_at?: string;
    created_by?: string;
    created_via?: string;
    ai_confidence?: number | null;
  }>;
}) {
  let firstNodeQueryReturned = false;
  return {
    from: vi.fn((table: string) => {
      if (table === "nodes") {
        const neighbourPromise = Promise.resolve({
          data: (opts.neighbours ?? []).map((n) => ({
            id: n.id,
            node_type: n.node_type,
            label: n.label,
            state: n.state ?? null,
            data: n.data ?? null,
            created_at: n.created_at ?? "2026-05-01T00:00:00Z",
            created_by: n.created_by ?? USER,
            created_via: n.created_via ?? "manual",
            ai_confidence: n.ai_confidence ?? null,
          })),
          error: null,
        });
        const chain: Record<string, unknown> = {};
        Object.assign(chain, {
          select: vi.fn(() => chain),
          eq: vi.fn(() => chain),
          in: vi.fn(() => chain), // chain — final await on .is() resolves
          is: vi.fn(() => {
            // .is() acts as terminal for the .in() path; .maybeSingle() for the by-id path.
            return Object.assign(neighbourPromise, chain);
          }),
          maybeSingle: vi.fn(() => {
            if (!firstNodeQueryReturned) {
              firstNodeQueryReturned = true;
              return Promise.resolve({
                data: opts.deal === undefined ? null : opts.deal,
                error: null,
              });
            }
            return Promise.resolve({ data: null, error: null });
          }),
        });
        return chain;
      }
      if (table === "edges") {
        const chain = {
          select: vi.fn(() => chain),
          or: vi.fn(() => chain),
          is: vi.fn(() =>
            Promise.resolve({ data: opts.edges ?? [], error: null })
          ),
        };
        return chain;
      }
      throw new Error(`unexpected ${table}`);
    }),
  };
}

describe("getDealCanvas", () => {
  it("returns null on invalid UUID", async () => {
    const c = makeCanvasClient({});
    const r = await getDealCanvas("not-a-uuid", c as never);
    expect(r).toBeNull();
  });

  it("returns null when deal row missing", async () => {
    const c = makeCanvasClient({ deal: null });
    const r = await getDealCanvas(DEAL, c as never);
    expect(r).toBeNull();
  });

  it("returns deal header + linked leads + units + activities, partitioned by node_type", async () => {
    const c = makeCanvasClient({
      deal: {
        id: DEAL,
        organization_id: ORG,
        workspace_id: WS,
        label: "Skyline 3BHK",
        state: "negotiation",
        data: { value_inr: 25_000_000, owner_id: USER },
        created_at: "2026-05-01T00:00:00Z",
        updated_at: "2026-05-09T00:00:00Z",
      },
      edges: [
        { from_node_id: DEAL, to_node_id: LEAD },
        { from_node_id: DEAL, to_node_id: "unit-1" },
        { from_node_id: "act-1", to_node_id: DEAL },
      ],
      neighbours: [
        { id: LEAD, node_type: "lead", label: "Sharma family", state: "qualified" },
        {
          id: "unit-1",
          node_type: "unit",
          label: "A-1201",
          state: "held",
          data: { unit_no: "A-1201", property_id: "prop-1" },
        },
        {
          id: "act-1",
          node_type: "activity",
          label: "Site visit booked",
          created_at: "2026-05-08T10:00:00Z",
        },
      ],
    });

    const r = await getDealCanvas(DEAL, c as never);
    expect(r).not.toBeNull();
    if (!r) return;

    expect(r.deal.label).toBe("Skyline 3BHK");
    expect(r.deal.stage).toBe("negotiation");
    expect(r.deal.value_inr).toBe(25_000_000);

    expect(r.leads).toHaveLength(1);
    expect(r.leads[0]).toMatchObject({ id: LEAD, label: "Sharma family" });

    expect(r.units).toHaveLength(1);
    expect(r.units[0]).toMatchObject({
      unit_no: "A-1201",
      status: "held",
      property_id: "prop-1",
    });

    expect(r.activities).toHaveLength(1);
    expect(r.activities[0].label).toBe("Site visit booked");
  });

  it("falls back to 'qualified' stage when state is unrecognised", async () => {
    const c = makeCanvasClient({
      deal: {
        id: DEAL,
        organization_id: ORG,
        workspace_id: WS,
        label: "x",
        state: "weird",
        data: {},
        created_at: "2026-05-01T00:00:00Z",
        updated_at: "2026-05-01T00:00:00Z",
      },
      edges: [],
      neighbours: [],
    });
    const r = await getDealCanvas(DEAL, c as never);
    expect(r?.deal.stage).toBe("qualified");
  });
});

describe("promoteLeadToDeal", () => {
  function makePromoteClient(opts: {
    lead_found: boolean;
    deal_insert_error?: { message: string };
  }) {
    const inserts: { table: string; row: unknown }[] = [];
    return {
      inserts,
      client: {
        from: vi.fn((table: string) => {
          if (table === "nodes") {
            const chain = {
              select: vi.fn(() => chain),
              eq: vi.fn(() => chain),
              is: vi.fn(() => chain),
              maybeSingle: vi.fn(() =>
                Promise.resolve({
                  data: opts.lead_found
                    ? {
                        id: LEAD,
                        label: "Sharma",
                        state: "qualified",
                        organization_id: ORG,
                        workspace_id: WS,
                      }
                    : null,
                  error: null,
                })
              ),
              insert: vi.fn((row: unknown) => {
                inserts.push({ table: "nodes", row });
                return {
                  select: vi.fn(() => ({
                    single: vi.fn(() =>
                      Promise.resolve({
                        data: opts.deal_insert_error ? null : { id: DEAL },
                        error: opts.deal_insert_error ?? null,
                      })
                    ),
                  })),
                };
              }),
            };
            return chain;
          }
          if (table === "edges" || table === "audit_log") {
            return {
              insert: vi.fn((row: unknown) => {
                inserts.push({ table, row });
                return Promise.resolve({ error: null });
              }),
            };
          }
          throw new Error(`unexpected ${table}`);
        }),
      },
    };
  }

  it("happy path: inserts deal node, edge, audit row", async () => {
    const env = makePromoteClient({ lead_found: true });
    const r = await promoteLeadToDeal(
      {
        lead_id: LEAD,
        organization_id: ORG,
        workspace_id: WS,
        caller_id: USER,
      },
      env.client as never
    );
    expect(r).toEqual({ ok: true, deal_id: DEAL });
    const tables = env.inserts.map((i) => i.table);
    expect(tables).toEqual(["nodes", "edges", "audit_log"]);

    const dealRow = env.inserts[0].row as { state: string; node_type: string };
    expect(dealRow.state).toBe("qualified");
    expect(dealRow.node_type).toBe("deal");

    const edgeRow = env.inserts[1].row as {
      edge_type: string;
      from_node_id: string;
      to_node_id: string;
    };
    expect(edgeRow.edge_type).toBe("deal_to_lead");
    expect(edgeRow.from_node_id).toBe(DEAL);
    expect(edgeRow.to_node_id).toBe(LEAD);

    const audit = env.inserts[2].row as { action: string };
    expect(audit.action).toBe("deal_promoted_from_lead");
  });

  it("returns not_found when lead is missing or cross-tenant", async () => {
    const env = makePromoteClient({ lead_found: false });
    const r = await promoteLeadToDeal(
      {
        lead_id: LEAD,
        organization_id: ORG,
        workspace_id: WS,
        caller_id: USER,
      },
      env.client as never
    );
    expect(r).toEqual({ ok: false, error: "not_found" });
    expect(env.inserts).toHaveLength(0);
  });

  it("propagates DB error on insert", async () => {
    const env = makePromoteClient({
      lead_found: true,
      deal_insert_error: { message: "constraint" },
    });
    const r = await promoteLeadToDeal(
      {
        lead_id: LEAD,
        organization_id: ORG,
        workspace_id: WS,
        caller_id: USER,
      },
      env.client as never
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe("internal");
      expect(r.message).toContain("constraint");
    }
  });
});
