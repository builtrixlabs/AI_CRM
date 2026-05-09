import { describe, expect, it, vi } from "vitest";
import {
  createField,
  deleteField,
  listFieldsForOrg,
  listFieldsForType,
  updateField,
} from "@/lib/customfields/admin";
import {
  CustomFieldError,
  type CustomFieldRow,
} from "@/lib/customfields/types";

const ORG_A = "11111111-2222-4333-8444-555555555555";
const ORG_B = "22222222-3333-4444-8555-666666666666";
const ACTOR = "33333333-4444-4555-8666-777777777777";

function fieldRow(over: Partial<CustomFieldRow> = {}): CustomFieldRow {
  return {
    id: "00000000-0000-4000-8000-000000000099",
    organization_id: ORG_A,
    node_type: "lead",
    field_key: "budget_inr",
    label: "Budget (₹)",
    kind: "number",
    required: false,
    options: [],
    sort_order: 0,
    created_at: "2026-05-09",
    deleted_at: null,
    ...over,
  };
}

function makeClient(opts: {
  rows?: CustomFieldRow[];
  insert_id?: string;
  insert_error?: string;
  update_error?: string;
  duplicate_lookup?: { id: string } | null;
}) {
  const inserts: Array<Record<string, unknown>> = [];
  const audit: Array<Record<string, unknown>> = [];
  const updates: Array<{ payload: Record<string, unknown>; filter: Record<string, unknown> }> = [];

  function fromHandler(table: string) {
    if (table === "custom_field_definitions") {
      return {
        select: (_cols?: string) => {
          const filters: Record<string, unknown> = {};
          const chain: Record<string, unknown> = {};
          chain.eq = (k: string, v: unknown) => {
            filters[k] = v;
            return chain;
          };
          chain.is = (k: string, v: unknown) => {
            filters[`${k}_is`] = v;
            return chain;
          };
          chain.order = () => chain;
          chain.maybeSingle = () => {
            if (filters.id != null) {
              const r = (opts.rows ?? []).find(
                (x) =>
                  x.id === filters.id &&
                  x.organization_id === filters.organization_id,
              );
              return Promise.resolve({ data: r ?? null, error: null });
            }
            // Duplicate-key lookup uses (org, node_type, field_key)
            if (
              filters.field_key != null &&
              filters.node_type != null &&
              filters.organization_id != null
            ) {
              return Promise.resolve({
                data: opts.duplicate_lookup ?? null,
                error: null,
              });
            }
            return Promise.resolve({ data: null, error: null });
          };
          (chain as unknown as PromiseLike<unknown>).then = (
            resolve: (v: unknown) => unknown,
          ) => {
            const filtered = (opts.rows ?? []).filter((r) => {
              if (r.organization_id !== filters.organization_id) return false;
              if (filters.node_type && r.node_type !== filters.node_type)
                return false;
              return true;
            });
            return Promise.resolve({ data: filtered, error: null }).then(
              resolve,
            );
          };
          return chain;
        },
        insert: (payload: Record<string, unknown>) => {
          inserts.push(payload);
          return {
            select: () => ({
              single: () =>
                Promise.resolve({
                  data: { id: opts.insert_id ?? "new-id" },
                  error: opts.insert_error ? { message: opts.insert_error } : null,
                }),
            }),
          };
        },
        update: (payload: Record<string, unknown>) => {
          const filter: Record<string, unknown> = {};
          const chain: Record<string, unknown> = {};
          chain.eq = (k: string, v: unknown) => {
            filter[k] = v;
            return chain;
          };
          (chain as unknown as PromiseLike<unknown>).then = (
            resolve: (v: unknown) => unknown,
          ) => {
            updates.push({ payload, filter });
            return Promise.resolve({
              error: opts.update_error ? { message: opts.update_error } : null,
            }).then(resolve);
          };
          return chain;
        },
      };
    }
    if (table === "audit_log") {
      return {
        insert: (payload: Record<string, unknown>) => {
          audit.push(payload);
          return Promise.resolve({ error: null });
        },
      };
    }
    throw new Error(`unhandled: ${table}`);
  }

  return {
    inserts,
    audit,
    updates,
    client: { from: vi.fn(fromHandler) } as unknown as Parameters<typeof createField>[1],
  };
}

describe("listFieldsForOrg / listFieldsForType", () => {
  it("filters by organization_id", async () => {
    const m = makeClient({
      rows: [
        fieldRow({ organization_id: ORG_A, field_key: "a" }),
        fieldRow({ organization_id: ORG_B, field_key: "b" }),
      ],
    });
    const r = await listFieldsForOrg(ORG_A, m.client);
    expect(r.map((x) => x.field_key)).toEqual(["a"]);
  });

  it("listFieldsForType filters by node_type within the org", async () => {
    const m = makeClient({
      rows: [
        fieldRow({ field_key: "k1", node_type: "lead" }),
        fieldRow({ field_key: "k2", node_type: "deal" }),
      ],
    });
    const r = await listFieldsForType(ORG_A, "lead", m.client);
    expect(r.map((x) => x.field_key)).toEqual(["k1"]);
  });
});

describe("createField", () => {
  it("inserts a new field + audit", async () => {
    const m = makeClient({ rows: [], insert_id: "new" });
    const r = await createField(
      {
        caller_org_id: ORG_A,
        actor_id: ACTOR,
        actor_role: "org_admin",
        input: {
          node_type: "lead",
          field_key: "budget_inr",
          label: "Budget (₹)",
          kind: "number",
          required: false,
          options: [],
          sort_order: 0,
        },
      },
      m.client,
    );
    expect(r).toEqual({ id: "new" });
    expect(m.inserts).toHaveLength(1);
    expect(m.inserts[0].field_key).toBe("budget_inr");
    expect(m.audit[0]).toMatchObject({ action: "custom_field_created" });
  });

  it("rejects duplicate (org, node_type, field_key)", async () => {
    const m = makeClient({
      rows: [],
      duplicate_lookup: { id: "existing" },
    });
    await expect(
      createField(
        {
          caller_org_id: ORG_A,
          actor_id: ACTOR,
          actor_role: "org_admin",
          input: {
            node_type: "lead",
            field_key: "budget_inr",
            label: "Budget",
            kind: "number",
            required: false,
            options: [],
            sort_order: 0,
          },
        },
        m.client,
      ),
    ).rejects.toBeInstanceOf(CustomFieldError);
  });
});

describe("updateField", () => {
  it("updates label + audits", async () => {
    const m = makeClient({ rows: [fieldRow({ id: "f1" })] });
    await updateField(
      {
        caller_org_id: ORG_A,
        actor_id: ACTOR,
        actor_role: "org_admin",
        input: { id: "f1", label: "New label" },
      },
      m.client,
    );
    expect(m.updates[0].payload.label).toBe("New label");
    expect(m.audit[0]).toMatchObject({ action: "custom_field_updated" });
  });

  it("rejects cross-tenant target", async () => {
    const m = makeClient({
      rows: [fieldRow({ id: "f1", organization_id: ORG_B })],
    });
    await expect(
      updateField(
        {
          caller_org_id: ORG_A,
          actor_id: ACTOR,
          actor_role: "org_admin",
          input: { id: "f1", label: "x" },
        },
        m.client,
      ),
    ).rejects.toBeInstanceOf(CustomFieldError);
  });
});

describe("deleteField", () => {
  it("soft-deletes + audits", async () => {
    const m = makeClient({ rows: [fieldRow({ id: "f1" })] });
    await deleteField(
      {
        caller_org_id: ORG_A,
        actor_id: ACTOR,
        actor_role: "org_admin",
        input: { id: "f1" },
      },
      m.client,
    );
    expect(m.updates[0].payload.deleted_at).toBeTruthy();
    expect(m.audit[0]).toMatchObject({ action: "custom_field_deleted" });
  });

  it("rejects cross-tenant", async () => {
    const m = makeClient({
      rows: [fieldRow({ id: "f1", organization_id: ORG_B })],
    });
    await expect(
      deleteField(
        {
          caller_org_id: ORG_A,
          actor_id: ACTOR,
          actor_role: "org_admin",
          input: { id: "f1" },
        },
        m.client,
      ),
    ).rejects.toBeInstanceOf(CustomFieldError);
  });
});
