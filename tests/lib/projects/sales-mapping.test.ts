import { describe, expect, it } from "vitest";
import {
  resolveSalesRepForProject,
  addAssignment,
  setPrimaryRep,
  listProjectAssignments,
} from "@/lib/projects/sales-mapping";

const ORG = "11111111-2222-4333-8444-555555555555";
const PROJECT = "22222222-3333-4444-8555-666666666666";
const PRIMARY = "aaaaaaaa-3333-4444-8555-666666666666";
const REP_B = "bbbbbbbb-3333-4444-8555-666666666666";
const REP_C = "cccccccc-3333-4444-8555-666666666666";

type Assignment = {
  id?: string;
  sales_rep_id: string;
  is_primary: boolean;
  created_at: string;
};
type Profile = { id: string; display_name?: string; on_leave?: boolean };

function makeClient(opts: {
  assignments?: Assignment[];
  profiles?: Profile[];
  insertError?: { code?: string; message: string } | null;
  setPrimaryRows?: unknown[];
}) {
  function psaBuilder() {
    const b: Record<string, unknown> = {};
    Object.assign(b, {
      select: () => b,
      eq: () => b,
      then: (onF: (v: { data: unknown; error: null }) => unknown) =>
        Promise.resolve({ data: opts.assignments ?? [], error: null }).then(
          onF,
        ),
      insert: () =>
        Promise.resolve({ error: opts.insertError ?? null }),
      delete: () => {
        const d: Record<string, unknown> = {};
        Object.assign(d, {
          eq: () => d,
          then: (onF: (v: { error: null }) => unknown) =>
            Promise.resolve({ error: null }).then(onF),
        });
        return d;
      },
      update: () => {
        const u: Record<string, unknown> = {};
        Object.assign(u, {
          eq: () => u,
          select: () =>
            Promise.resolve({
              data: opts.setPrimaryRows ?? [{ id: "a1" }],
              error: null,
            }),
          then: (onF: (v: { error: null }) => unknown) =>
            Promise.resolve({ error: null }).then(onF),
        });
        return u;
      },
    });
    return b;
  }
  function profilesBuilder() {
    const b: Record<string, unknown> = {};
    Object.assign(b, {
      select: () => b,
      eq: () => b,
      in: () => b,
      is: () => b,
      order: () => b,
      then: (onF: (v: { data: unknown; error: null }) => unknown) =>
        Promise.resolve({ data: opts.profiles ?? [], error: null }).then(onF),
    });
    return b;
  }
  return {
    from: (table: string) => {
      if (table === "project_sales_assignments") return psaBuilder();
      if (table === "profiles") return profilesBuilder();
      throw new Error(`unexpected table ${table}`);
    },
  };
}

describe("resolveSalesRepForProject — primary + on-leave fallback (AC-2)", () => {
  it("returns the primary rep when available", async () => {
    const client = makeClient({
      assignments: [
        { sales_rep_id: PRIMARY, is_primary: true, created_at: "2026-05-01" },
        { sales_rep_id: REP_B, is_primary: false, created_at: "2026-05-02" },
      ],
      profiles: [
        { id: PRIMARY, on_leave: false },
        { id: REP_B, on_leave: false },
      ],
    });
    const r = await resolveSalesRepForProject(ORG, PROJECT, client as never);
    expect(r).toEqual({
      sales_rep_id: PRIMARY,
      is_primary: true,
      fallback: false,
    });
  });

  it("falls back to the oldest available non-primary rep when the primary is on leave", async () => {
    const client = makeClient({
      assignments: [
        { sales_rep_id: PRIMARY, is_primary: true, created_at: "2026-05-01" },
        { sales_rep_id: REP_C, is_primary: false, created_at: "2026-05-03" },
        { sales_rep_id: REP_B, is_primary: false, created_at: "2026-05-02" },
      ],
      profiles: [
        { id: PRIMARY, on_leave: true },
        { id: REP_B, on_leave: false },
        { id: REP_C, on_leave: false },
      ],
    });
    const r = await resolveSalesRepForProject(ORG, PROJECT, client as never);
    expect(r).toEqual({
      sales_rep_id: REP_B, // oldest non-primary (2026-05-02 < 2026-05-03)
      is_primary: false,
      fallback: true,
    });
  });

  it("returns null when the primary is on leave and every other rep is too", async () => {
    const client = makeClient({
      assignments: [
        { sales_rep_id: PRIMARY, is_primary: true, created_at: "2026-05-01" },
        { sales_rep_id: REP_B, is_primary: false, created_at: "2026-05-02" },
      ],
      profiles: [
        { id: PRIMARY, on_leave: true },
        { id: REP_B, on_leave: true },
      ],
    });
    const r = await resolveSalesRepForProject(ORG, PROJECT, client as never);
    expect(r).toBeNull();
  });

  it("returns null when the project has no assignments", async () => {
    const client = makeClient({ assignments: [] });
    const r = await resolveSalesRepForProject(ORG, PROJECT, client as never);
    expect(r).toBeNull();
  });

  it("picks the oldest available non-primary when there is no primary at all", async () => {
    const client = makeClient({
      assignments: [
        { sales_rep_id: REP_C, is_primary: false, created_at: "2026-05-05" },
        { sales_rep_id: REP_B, is_primary: false, created_at: "2026-05-04" },
      ],
      profiles: [
        { id: REP_B, on_leave: false },
        { id: REP_C, on_leave: false },
      ],
    });
    const r = await resolveSalesRepForProject(ORG, PROJECT, client as never);
    expect(r?.sales_rep_id).toBe(REP_B);
    expect(r?.fallback).toBe(true);
  });
});

describe("addAssignment", () => {
  it("returns ok on a clean insert", async () => {
    const client = makeClient({ insertError: null });
    const r = await addAssignment(
      {
        organization_id: ORG,
        project_id: PROJECT,
        sales_rep_id: REP_B,
        created_by: PRIMARY,
      },
      client as never,
    );
    expect(r.ok).toBe(true);
  });

  it("maps a unique-violation (23505) to reason='duplicate'", async () => {
    const client = makeClient({
      insertError: { code: "23505", message: "duplicate key" },
    });
    const r = await addAssignment(
      {
        organization_id: ORG,
        project_id: PROJECT,
        sales_rep_id: REP_B,
        created_by: PRIMARY,
      },
      client as never,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("duplicate");
  });
});

describe("setPrimaryRep", () => {
  it("returns ok when the target row exists", async () => {
    const client = makeClient({ setPrimaryRows: [{ id: "a1" }] });
    const r = await setPrimaryRep(
      { organization_id: ORG, project_id: PROJECT, sales_rep_id: REP_B },
      client as never,
    );
    expect(r.ok).toBe(true);
  });

  it("returns not_found when the rep is not assigned to the project", async () => {
    const client = makeClient({ setPrimaryRows: [] });
    const r = await setPrimaryRep(
      { organization_id: ORG, project_id: PROJECT, sales_rep_id: REP_B },
      client as never,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("not_found");
  });
});

describe("listProjectAssignments", () => {
  it("joins rep names + on_leave and sorts primary-first", async () => {
    const client = makeClient({
      assignments: [
        {
          id: "a-b",
          sales_rep_id: REP_B,
          is_primary: false,
          created_at: "2026-05-02",
        },
        {
          id: "a-primary",
          sales_rep_id: PRIMARY,
          is_primary: true,
          created_at: "2026-05-01",
        },
      ],
      profiles: [
        { id: PRIMARY, display_name: "Anjali P", on_leave: false },
        { id: REP_B, display_name: "Biju K", on_leave: true },
      ],
    });
    const rows = await listProjectAssignments(ORG, PROJECT, client as never);
    expect(rows).toHaveLength(2);
    expect(rows[0].sales_rep_id).toBe(PRIMARY); // primary sorted first
    expect(rows[0].sales_rep_name).toBe("Anjali P");
    expect(rows[1].sales_rep_on_leave).toBe(true);
  });
});
