import { describe, expect, it, vi } from "vitest";
import {
  RLS_AUDIT_EXCLUDE_TABLES,
  RLS_AUDIT_PINPOINT_TABLES,
  enumerateTenantTables,
  probeCrossOrgInsert,
  probeCrossOrgRead,
  rlsErrorIsExpectedDenial,
} from "@/lib/security/rls-audit";

function makeInfoSchemaClient(rows: { table_name: string; column_name: string }[]) {
  return {
    schema: vi.fn(() => ({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            in: vi.fn(() => Promise.resolve({ data: rows, error: null })),
          })),
        })),
      })),
    })),
  };
}

function makeReadClient(opts: {
  data?: unknown[];
  error?: { code?: string; message?: string } | null;
}) {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          limit: vi.fn(() =>
            Promise.resolve({
              data: opts.data ?? null,
              error: opts.error ?? null,
            })
          ),
        })),
      })),
    })),
  };
}

function makeInsertClient(opts: {
  data?: unknown[];
  error?: { code?: string; message?: string } | null;
}) {
  return {
    from: vi.fn(() => ({
      insert: vi.fn(() => ({
        select: vi.fn(() =>
          Promise.resolve({
            data: opts.data ?? null,
            error: opts.error ?? null,
          })
        ),
      })),
    })),
  };
}

describe("rls-audit.enumerateTenantTables", () => {
  it("groups columns into table records", async () => {
    const c = makeInfoSchemaClient([
      { table_name: "nodes", column_name: "organization_id" },
      { table_name: "nodes", column_name: "workspace_id" },
      { table_name: "edges", column_name: "organization_id" },
      { table_name: "subscription_plans", column_name: "tier" },
    ]);
    const tables = await enumerateTenantTables(c as never);
    expect(tables).toEqual([
      { table_name: "edges", has_organization_id: true, has_workspace_id: false },
      { table_name: "nodes", has_organization_id: true, has_workspace_id: true },
    ]);
  });

  it("excludes tables on the deny list (e.g. directives, audit_log)", async () => {
    const c = makeInfoSchemaClient([
      { table_name: "nodes", column_name: "organization_id" },
      { table_name: "directives", column_name: "organization_id" },
      { table_name: "audit_log", column_name: "organization_id" },
    ]);
    const tables = await enumerateTenantTables(c as never);
    expect(tables.map((t) => t.table_name)).toEqual(["nodes"]);
  });

  it("filters tables that lack organization_id (workspace_id alone is not tenant-scoped)", async () => {
    const c = makeInfoSchemaClient([
      { table_name: "team_members", column_name: "workspace_id" },
    ]);
    const tables = await enumerateTenantTables(c as never);
    expect(tables).toEqual([]);
  });
});

describe("rls-audit.probeCrossOrgRead", () => {
  it("returns ok with 0 rows visible when select returns empty (RLS quietly denies)", async () => {
    const c = makeReadClient({ data: [] });
    const r = await probeCrossOrgRead(c as never, "nodes", "org-X");
    expect(r).toEqual({ ok: true, rows_visible: 0 });
  });

  it("returns leak when SELECT returns rows", async () => {
    const c = makeReadClient({
      data: [{ organization_id: "org-X" }, { organization_id: "org-X" }],
    });
    const r = await probeCrossOrgRead(c as never, "nodes", "org-X");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("leak");
      expect(r.rows_visible).toBe(2);
    }
  });

  it("treats explicit RLS error code as expected denial (not a leak)", async () => {
    const c = makeReadClient({ error: { code: "42501", message: "denied" } });
    const r = await probeCrossOrgRead(c as never, "nodes", "org-X");
    expect(r).toEqual({ ok: true, rows_visible: 0 });
  });

  it("surfaces non-RLS errors as test-payload bugs", async () => {
    const c = makeReadClient({
      error: { code: "42P01", message: "relation does not exist" },
    });
    const r = await probeCrossOrgRead(c as never, "nope", "org-X");
    expect(r.ok).toBe(false);
    if (!r.ok && r.reason === "error") {
      expect(r.message).toContain("does not exist");
    }
  });
});

describe("rls-audit.probeCrossOrgInsert", () => {
  it("ok when INSERT is RLS-rejected", async () => {
    const c = makeInsertClient({
      error: { code: "42501", message: "row-level security violation" },
    });
    const r = await probeCrossOrgInsert(
      c as never,
      "nodes",
      { kind: "lead" },
      "org-X"
    );
    expect(r).toEqual({ ok: true, rows_visible: 0 });
  });

  it("leak when INSERT succeeds (cross-tenant write)", async () => {
    const c = makeInsertClient({
      data: [{ id: "row-1", organization_id: "org-X" }],
    });
    const r = await probeCrossOrgInsert(
      c as never,
      "nodes",
      { kind: "lead" },
      "org-X"
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("leak");
  });
});

describe("rls-audit.rlsErrorIsExpectedDenial", () => {
  it.each([
    [{ code: "42501" }, true],
    [{ code: "PGRST301" }, true],
    [{ message: "new row violates row-level security policy" }, true],
    [{ code: "23502" }, false], // not_null_violation
    [{ code: "42P01" }, false], // undefined_table
    [{ message: "" }, false],
  ])("%j -> %s", (err, expected) => {
    expect(rlsErrorIsExpectedDenial(err as never)).toBe(expected);
  });
});

describe("rls-audit constants", () => {
  it("pinpoint tables are on the canonical D-302 list", () => {
    expect(RLS_AUDIT_PINPOINT_TABLES).toEqual([
      "nodes",
      "edges",
      "node_signals",
      "api_audit_log",
      "org_integration_secrets",
    ]);
  });

  it("exclude list contains the documented platform-default tables", () => {
    for (const t of ["directives", "platform_flags", "subscription_plans", "audit_log"]) {
      expect(RLS_AUDIT_EXCLUDE_TABLES.has(t)).toBe(true);
    }
  });
});
