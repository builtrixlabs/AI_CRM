import { describe, expect, it, vi } from "vitest";
import { updateProperty, updateUnit } from "@/lib/catalog/api";

const ORG = "11111111-2222-4333-8444-555555555555";
const UNIT = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const USER = "99999999-8888-4777-8666-555555555555";
const NOW_TS = "2026-05-09T10:00:00.000Z";

function makeClient(opts: {
  existing?: {
    state?: string;
    data?: Record<string, unknown>;
    updated_at?: string;
  } | null;
  fetch_error?: { message: string } | null;
  update_rows?: unknown[];
  update_error?: { message: string } | null;
  node_type?: "unit" | "property";
}) {
  const audits: unknown[] = [];
  const updates: { row: unknown; eqs: Array<[string, unknown]> }[] = [];
  const fetchChain: Record<string, unknown> = {};
  Object.assign(fetchChain, {
    select: vi.fn(() => fetchChain),
    eq: vi.fn(() => fetchChain),
    is: vi.fn(() => fetchChain),
    maybeSingle: vi.fn(() =>
      Promise.resolve({
        data:
          opts.existing === null
            ? null
            : {
                state: opts.existing?.state ?? null,
                data: opts.existing?.data ?? null,
                updated_at: opts.existing?.updated_at ?? NOW_TS,
              },
        error: opts.fetch_error ?? null,
      })
    ),
  });

  const updateEqs: Array<[string, unknown]> = [];
  const updateChain: Record<string, unknown> = {};
  let lastUpdateRow: unknown = null;
  Object.assign(updateChain, {
    update: vi.fn((row: unknown) => {
      lastUpdateRow = row;
      updateEqs.length = 0;
      return updateChain;
    }),
    eq: vi.fn((col: string, val: unknown) => {
      updateEqs.push([col, val]);
      return updateChain;
    }),
    select: vi.fn(() => {
      updates.push({ row: lastUpdateRow, eqs: [...updateEqs] });
      return Promise.resolve({
        data: opts.update_rows ?? [{ id: UNIT }],
        error: opts.update_error ?? null,
      });
    }),
  });

  return {
    audits,
    updates,
    client: {
      from: vi.fn((table: string) => {
        if (table === "nodes") {
          return new Proxy(updateChain, {
            get(target, prop) {
              if (prop === "select" || prop === "eq" || prop === "is" || prop === "maybeSingle") {
                // Disambiguate: if no UPDATE issued yet, treat as fetch chain.
                return (fetchChain as Record<string, unknown>)[prop as string];
              }
              return (target as Record<string, unknown>)[prop as string];
            },
          });
        }
        if (table === "audit_log") {
          return {
            insert: vi.fn((row: unknown) => {
              audits.push(row);
              return Promise.resolve({ error: null });
            }),
          };
        }
        throw new Error(`unexpected ${table}`);
      }),
    },
  };
}

describe("updateUnit", () => {
  it("happy path: forward transition + audit", async () => {
    const env = makeClient({
      existing: {
        state: "available",
        data: { unit_no: "A-101", price: 5_000_000 },
      },
    });
    const r = await updateUnit(
      {
        unit_id: UNIT,
        organization_id: ORG,
        patch: { status: "held", price: 5_500_000 },
        expected_updated_at: NOW_TS,
        caller_id: USER,
        has_override: false,
      },
      env.client as never
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(typeof r.updated_at).toBe("string");

    expect(env.updates).toHaveLength(1);
    const u = env.updates[0].row as Record<string, unknown>;
    expect(u.state).toBe("held");
    expect((u.data as { price: number }).price).toBe(5_500_000);

    // Optimistic-lock predicate: the UPDATE includes .eq("updated_at", expected).
    expect(env.updates[0].eqs).toContainEqual(["updated_at", NOW_TS]);

    expect(env.audits).toHaveLength(1);
    const audit = env.audits[0] as { action: string; diff: Record<string, unknown> };
    expect(audit.action).toBe("unit_edited");
    expect(audit.diff.status).toEqual({ from: "available", to: "held" });
    expect(audit.diff.price).toEqual({ from: 5_000_000, to: 5_500_000 });
  });

  it("returns stale when expected_updated_at doesn't match", async () => {
    const env = makeClient({
      existing: { state: "available", updated_at: NOW_TS },
    });
    const r = await updateUnit(
      {
        unit_id: UNIT,
        organization_id: ORG,
        patch: { price: 1 },
        expected_updated_at: "2020-01-01T00:00:00.000Z",
        caller_id: USER,
        has_override: false,
      },
      env.client as never
    );
    expect(r).toEqual({ ok: false, error: "stale" });
    expect(env.updates).toHaveLength(0);
  });

  it("returns not_found when row missing", async () => {
    const env = makeClient({ existing: null });
    const r = await updateUnit(
      {
        unit_id: UNIT,
        organization_id: ORG,
        patch: { price: 1 },
        expected_updated_at: NOW_TS,
        caller_id: USER,
        has_override: false,
      },
      env.client as never
    );
    expect(r).toEqual({ ok: false, error: "not_found" });
  });

  it("backward transition without override returns override_required", async () => {
    const env = makeClient({
      existing: { state: "booked", data: {} },
    });
    const r = await updateUnit(
      {
        unit_id: UNIT,
        organization_id: ORG,
        patch: { status: "available" },
        expected_updated_at: NOW_TS,
        caller_id: USER,
        has_override: false,
      },
      env.client as never
    );
    expect(r).toEqual({ ok: false, error: "override_required" });
    expect(env.updates).toHaveLength(0);
  });

  it("backward transition with override succeeds + audits status diff", async () => {
    const env = makeClient({
      existing: { state: "booked", data: {} },
    });
    const r = await updateUnit(
      {
        unit_id: UNIT,
        organization_id: ORG,
        patch: { status: "available" },
        expected_updated_at: NOW_TS,
        caller_id: USER,
        has_override: true,
      },
      env.client as never
    );
    expect(r.ok).toBe(true);
    expect(env.updates).toHaveLength(1);
    expect(
      (env.updates[0].row as { state: string }).state
    ).toBe("available");
    expect(env.audits).toHaveLength(1);
  });

  it("rejects bad patch shape", async () => {
    const env = makeClient({});
    const r = await updateUnit(
      {
        unit_id: UNIT,
        organization_id: ORG,
        patch: { bhk: 999 } as never,
        expected_updated_at: NOW_TS,
        caller_id: USER,
        has_override: false,
      },
      env.client as never
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("validation");
  });

  it("update returning 0 rows -> stale (race-detected at UPDATE time)", async () => {
    const env = makeClient({
      existing: { state: "available", data: {} },
      update_rows: [],
    });
    const r = await updateUnit(
      {
        unit_id: UNIT,
        organization_id: ORG,
        patch: { price: 1 },
        expected_updated_at: NOW_TS,
        caller_id: USER,
        has_override: false,
      },
      env.client as never
    );
    expect(r).toEqual({ ok: false, error: "stale" });
  });

  it("empty patch (no real change) skips audit row", async () => {
    const env = makeClient({
      existing: { state: "available", data: { price: 100 } },
    });
    const r = await updateUnit(
      {
        unit_id: UNIT,
        organization_id: ORG,
        patch: { price: 100 },
        expected_updated_at: NOW_TS,
        caller_id: USER,
        has_override: false,
      },
      env.client as never
    );
    expect(r.ok).toBe(true);
    expect(env.audits).toHaveLength(0);
  });
});

describe("updateProperty", () => {
  it("happy path: name change persists + audits", async () => {
    const env = makeClient({
      existing: {
        data: { name: "Tower A", city: "Mumbai" },
      },
    });
    const r = await updateProperty(
      {
        property_id: UNIT,
        organization_id: ORG,
        patch: { name: "Tower A — South Block" },
        expected_updated_at: NOW_TS,
        caller_id: USER,
      },
      env.client as never
    );
    expect(r.ok).toBe(true);
    expect(env.audits).toHaveLength(1);
    const audit = env.audits[0] as { action: string };
    expect(audit.action).toBe("property_edited");
  });

  it("stale write detected", async () => {
    const env = makeClient({
      existing: { data: {}, updated_at: NOW_TS },
      update_rows: [],
    });
    const r = await updateProperty(
      {
        property_id: UNIT,
        organization_id: ORG,
        patch: { name: "x" },
        expected_updated_at: NOW_TS,
        caller_id: USER,
      },
      env.client as never
    );
    expect(r).toEqual({ ok: false, error: "stale" });
  });
});
