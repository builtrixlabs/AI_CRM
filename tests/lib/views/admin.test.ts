import { describe, expect, it, vi } from "vitest";
import {
  createView,
  deleteView,
  setDefaultView,
  updateView,
} from "@/lib/views/admin";
import { CustomViewError, type CustomViewRow } from "@/lib/views/types";

const ORG_A = "11111111-2222-4333-8444-555555555555";
const ORG_B = "22222222-3333-4444-8555-666666666666";
const ACTOR = "33333333-4444-4555-8666-777777777777";

function viewRow(over: Partial<CustomViewRow> = {}): CustomViewRow {
  return {
    id: "00000000-0000-4000-8000-000000000099",
    organization_id: ORG_A,
    entity_type: "lead",
    scope: "org",
    owner_id: null,
    name: "Hot Meta leads",
    slug: "hot-meta-leads",
    filters: [],
    columns: [],
    sort: null,
    created_at: "2026-05-11",
    deleted_at: null,
    ...over,
  };
}

type CallLog = {
  inserts: Array<{ table: string; payload: Record<string, unknown> }>;
  updates: Array<{
    table: string;
    payload: Record<string, unknown>;
    filter: Record<string, unknown>;
  }>;
  audit: Array<Record<string, unknown>>;
};

function makeClient(
  opts: {
    rows?: CustomViewRow[];
    insert_id?: string;
    insert_error?: string;
    update_error?: string;
    profile_view_defaults?: Record<string, string>;
  },
  log: CallLog = { inserts: [], updates: [], audit: [] },
) {
  function fromHandler(table: string) {
    if (table === "custom_views") {
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
          chain.or = () => chain;
          chain.order = () => chain;
          chain.maybeSingle = () => {
            const r = (opts.rows ?? []).find((x) => {
              if (filters.id != null && x.id !== filters.id) return false;
              if (
                filters.organization_id != null &&
                x.organization_id !== filters.organization_id
              )
                return false;
              if (filters.scope != null && x.scope !== filters.scope) return false;
              if (filters.slug != null && x.slug !== filters.slug) return false;
              if (
                filters.owner_id != null &&
                x.owner_id !== filters.owner_id
              )
                return false;
              if (
                filters.entity_type != null &&
                x.entity_type !== filters.entity_type
              )
                return false;
              return true;
            });
            return Promise.resolve({ data: r ?? null, error: null });
          };
          (chain as unknown as PromiseLike<unknown>).then = (
            resolve: (v: unknown) => unknown,
          ) => {
            // Array-returning select used by the org-scope duplicate check.
            const filtered = (opts.rows ?? []).filter((r) => {
              if (
                filters.organization_id != null &&
                r.organization_id !== filters.organization_id
              )
                return false;
              if (filters.scope != null && r.scope !== filters.scope) return false;
              if (filters.slug != null && r.slug !== filters.slug) return false;
              if (
                filters.entity_type != null &&
                r.entity_type !== filters.entity_type
              )
                return false;
              return true;
            });
            return Promise.resolve({ data: filtered, error: null }).then(resolve);
          };
          return chain;
        },
        insert: (payload: Record<string, unknown>) => {
          log.inserts.push({ table, payload });
          return {
            select: () => ({
              single: () =>
                Promise.resolve({
                  data: { id: opts.insert_id ?? "new-id" },
                  error: opts.insert_error
                    ? { message: opts.insert_error }
                    : null,
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
            log.updates.push({ table, payload, filter });
            return Promise.resolve({
              error: opts.update_error ? { message: opts.update_error } : null,
            }).then(resolve);
          };
          return chain;
        },
      };
    }
    if (table === "profiles") {
      return {
        select: (_cols?: string) => {
          const filters: Record<string, unknown> = {};
          const chain: Record<string, unknown> = {};
          chain.eq = (k: string, v: unknown) => {
            filters[k] = v;
            return chain;
          };
          chain.maybeSingle = () =>
            Promise.resolve({
              data: { view_defaults: opts.profile_view_defaults ?? {} },
              error: null,
            });
          return chain;
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
            log.updates.push({ table, payload, filter });
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
          log.audit.push(payload);
          return Promise.resolve({ error: null });
        },
      };
    }
    throw new Error(`unhandled table: ${table}`);
  }

  return {
    log,
    client: { from: vi.fn(fromHandler) } as unknown as Parameters<
      typeof createView
    >[1],
  };
}

describe("createView", () => {
  it("inserts an org-scoped view + audit row", async () => {
    const m = makeClient({ rows: [], insert_id: "v1" });
    const r = await createView(
      {
        caller_org_id: ORG_A,
        actor_id: ACTOR,
        actor_role: "org_admin",
        input: {
          entity_type: "lead",
          scope: "org",
          name: "Hot Meta",
          slug: "hot-meta",
          filters: [],
          columns: [],
          sort: null,
        },
      },
      m.client,
    );
    expect(r).toEqual({ id: "v1" });
    expect(m.log.inserts).toHaveLength(1);
    expect(m.log.inserts[0].payload.scope).toBe("org");
    expect(m.log.inserts[0].payload.owner_id).toBeNull();
    expect(m.log.audit[0]).toMatchObject({ action: "view_created" });
  });

  it("user-scoped insert sets owner_id to caller", async () => {
    const m = makeClient({ rows: [], insert_id: "v2" });
    await createView(
      {
        caller_org_id: ORG_A,
        actor_id: ACTOR,
        actor_role: "rep",
        input: {
          entity_type: "lead",
          scope: "user",
          name: "My Stale",
          slug: "my-stale",
          filters: [],
          columns: [],
          sort: null,
        },
      },
      m.client,
    );
    expect(m.log.inserts[0].payload.scope).toBe("user");
    expect(m.log.inserts[0].payload.owner_id).toBe(ACTOR);
  });

  it("rejects duplicate slug in org scope", async () => {
    const m = makeClient({
      rows: [viewRow({ slug: "hot-meta", scope: "org" })],
    });
    await expect(
      createView(
        {
          caller_org_id: ORG_A,
          actor_id: ACTOR,
          actor_role: "org_admin",
          input: {
            entity_type: "lead",
            scope: "org",
            name: "x",
            slug: "hot-meta",
            filters: [],
            columns: [],
            sort: null,
          },
        },
        m.client,
      ),
    ).rejects.toBeInstanceOf(CustomViewError);
  });

  it("allows same slug across distinct scopes (org + user)", async () => {
    const m = makeClient({
      rows: [viewRow({ slug: "stale", scope: "org", owner_id: null })],
      insert_id: "v3",
    });
    const r = await createView(
      {
        caller_org_id: ORG_A,
        actor_id: ACTOR,
        actor_role: "rep",
        input: {
          entity_type: "lead",
          scope: "user",
          name: "My stale",
          slug: "stale",
          filters: [],
          columns: [],
          sort: null,
        },
      },
      m.client,
    );
    expect(r.id).toBe("v3");
  });
});

describe("updateView", () => {
  it("updates name + audits", async () => {
    const m = makeClient({ rows: [viewRow({ id: "v1" })] });
    await updateView(
      {
        caller_org_id: ORG_A,
        actor_id: ACTOR,
        actor_role: "org_admin",
        input: { id: "v1", name: "New name" },
      },
      m.client,
    );
    expect(m.log.updates[0].payload.name).toBe("New name");
    expect(m.log.audit[0]).toMatchObject({ action: "view_updated" });
  });

  it("rejects cross-tenant target", async () => {
    const m = makeClient({
      rows: [viewRow({ id: "v1", organization_id: ORG_B })],
    });
    await expect(
      updateView(
        {
          caller_org_id: ORG_A,
          actor_id: ACTOR,
          actor_role: "org_admin",
          input: { id: "v1", name: "x" },
        },
        m.client,
      ),
    ).rejects.toBeInstanceOf(CustomViewError);
  });
});

describe("deleteView", () => {
  it("soft-deletes + audits", async () => {
    const m = makeClient({ rows: [viewRow({ id: "v1" })] });
    await deleteView(
      {
        caller_org_id: ORG_A,
        actor_id: ACTOR,
        actor_role: "org_admin",
        input: { id: "v1", reason: "operator cleanup" },
      },
      m.client,
    );
    expect(m.log.updates[0].payload.deleted_at).toBeTruthy();
    expect(m.log.updates[0].payload.deleted_reason).toBe("operator cleanup");
    expect(m.log.audit[0]).toMatchObject({ action: "view_deleted" });
  });

  it("rejects cross-tenant", async () => {
    const m = makeClient({
      rows: [viewRow({ id: "v1", organization_id: ORG_B })],
    });
    await expect(
      deleteView(
        {
          caller_org_id: ORG_A,
          actor_id: ACTOR,
          actor_role: "org_admin",
          input: { id: "v1" },
        },
        m.client,
      ),
    ).rejects.toBeInstanceOf(CustomViewError);
  });
});

describe("setDefaultView", () => {
  it("merges view_defaults preserving other entity_type entries", async () => {
    const m = makeClient({
      rows: [viewRow({ id: "v-lead", entity_type: "lead" })],
      profile_view_defaults: { deal: "v-deal-uuid" },
    });
    await setDefaultView(
      {
        caller_org_id: ORG_A,
        actor_id: ACTOR,
        actor_role: "rep",
        input: { view_id: "v-lead" },
      },
      m.client,
    );
    const upd = m.log.updates.find((u) => u.table === "profiles");
    expect(upd?.payload.view_defaults).toEqual({
      deal: "v-deal-uuid",
      lead: "v-lead",
    });
    expect(upd?.filter.id).toBe(ACTOR);
    expect(m.log.audit[0]).toMatchObject({ action: "view_default_set" });
  });

  it("rejects unknown view_id", async () => {
    const m = makeClient({ rows: [] });
    await expect(
      setDefaultView(
        {
          caller_org_id: ORG_A,
          actor_id: ACTOR,
          actor_role: "rep",
          input: { view_id: "00000000-0000-4000-8000-000000000000" },
        },
        m.client,
      ),
    ).rejects.toBeInstanceOf(CustomViewError);
  });

  it("rejects cross-tenant view target", async () => {
    const m = makeClient({
      rows: [viewRow({ id: "v1", organization_id: ORG_B })],
    });
    await expect(
      setDefaultView(
        {
          caller_org_id: ORG_A,
          actor_id: ACTOR,
          actor_role: "rep",
          input: { view_id: "v1" },
        },
        m.client,
      ),
    ).rejects.toBeInstanceOf(CustomViewError);
  });
});
