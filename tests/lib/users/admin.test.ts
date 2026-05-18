import { describe, expect, it, vi } from "vitest";
import {
  changeBaseRole,
  deactivateUser,
  inviteUser,
  listUsersInOrg,
  workspaceCountsForUsers,
} from "@/lib/users/admin";
import { UsersAdminError } from "@/lib/users/types";

const ORG_A = "11111111-2222-4333-8444-555555555555";
const ORG_B = "22222222-3333-4444-8555-666666666666";
const ACTOR = "33333333-4444-4555-8666-777777777777";
const TARGET = "44444444-5555-4666-8777-888888888888";

type ProfileLite = {
  id: string;
  organization_id: string | null;
  email: string;
  display_name: string;
  base_role: string;
  created_at: string;
  deleted_at: string | null;
};

type Inserts = { audit_log: Array<Record<string, unknown>>; profiles: Array<Record<string, unknown>> };
type Updates = Array<{ table: string; payload: Record<string, unknown>; filter: Record<string, unknown> }>;

function makeClient(opts: {
  profiles?: ProfileLite[];
  email_lookup?: { id: string; organization_id: string | null; deleted_at: string | null } | null;
  user_app_roles?: Array<{ user_id: string; workspace_id: string | null }>;
  insert_error?: string;
  update_error?: string;
  create_user_error?: string;
  new_user_id?: string;
}) {
  const inserts: Inserts = { audit_log: [], profiles: [] };
  const updates: Updates = [];

  function fromHandler(table: string) {
    if (table === "profiles") {
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
          chain.in = (k: string, v: unknown[]) => {
            filters[`${k}_in`] = v;
            return chain;
          };
          chain.order = () => chain;
          chain.maybeSingle = () => {
            if (filters.email != null) {
              return Promise.resolve({ data: opts.email_lookup ?? null, error: null });
            }
            const id = filters.id;
            const org = filters.organization_id;
            const r = (opts.profiles ?? []).find(
              (p) => p.id === id && (org == null || p.organization_id === org),
            );
            return Promise.resolve({ data: r ?? null, error: null });
          };
          (chain as unknown as PromiseLike<unknown>).then = (
            resolve: (v: unknown) => unknown,
          ) => {
            const org = filters.organization_id;
            const filtered = (opts.profiles ?? []).filter((p) => {
              if (org && p.organization_id !== org) return false;
              if (filters.deleted_at_is === null && p.deleted_at !== null) return false;
              return true;
            });
            return Promise.resolve({ data: filtered, error: null }).then(resolve);
          };
          return chain;
        },
        insert: (payload: Record<string, unknown>) => {
          inserts.profiles.push(payload);
          return Promise.resolve({
            error: opts.insert_error ? { message: opts.insert_error } : null,
          });
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
            updates.push({ table: "profiles", payload, filter });
            return Promise.resolve({
              error: opts.update_error ? { message: opts.update_error } : null,
            }).then(resolve);
          };
          return chain;
        },
      };
    }
    if (table === "user_app_roles") {
      return {
        select: () => {
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
          chain.in = (k: string, v: unknown[]) => {
            filters[`${k}_in`] = v;
            return chain;
          };
          (chain as unknown as PromiseLike<unknown>).then = (
            resolve: (v: unknown) => unknown,
          ) => {
            return Promise.resolve({
              data: opts.user_app_roles ?? [],
              error: null,
            }).then(resolve);
          };
          return chain;
        },
        update: (payload: Record<string, unknown>) => {
          const filter: Record<string, unknown> = {};
          const chain: Record<string, unknown> = {};
          chain.eq = (k: string, v: unknown) => {
            filter[k] = v;
            return chain;
          };
          chain.is = (k: string, v: unknown) => {
            filter[`${k}_is`] = v;
            return chain;
          };
          (chain as unknown as PromiseLike<unknown>).then = (
            resolve: (v: unknown) => unknown,
          ) => {
            updates.push({ table: "user_app_roles", payload, filter });
            return Promise.resolve({ error: null }).then(resolve);
          };
          return chain;
        },
      };
    }
    if (table === "audit_log") {
      return {
        insert: (payload: Record<string, unknown>) => {
          inserts.audit_log.push(payload);
          return Promise.resolve({ error: null });
        },
      };
    }
    throw new Error(`unhandled table: ${table}`);
  }

  const client = {
    from: vi.fn(fromHandler),
    auth: {
      admin: {
        createUser: vi.fn(async () => {
          if (opts.create_user_error) {
            return {
              data: { user: null },
              error: { message: opts.create_user_error },
            };
          }
          return {
            data: { user: { id: opts.new_user_id ?? "new-uuid" } },
            error: null,
          };
        }),
      },
    },
  } as unknown as Parameters<typeof inviteUser>[1];

  return { client, inserts, updates };
}

describe("listUsersInOrg", () => {
  it("filters by org and excludes deleted", async () => {
    const m = makeClient({
      profiles: [
        {
          id: "u1",
          organization_id: ORG_A,
          email: "a@x.com",
          display_name: "A",
          base_role: "sales_rep",
          created_at: "2026-01-01",
          deleted_at: null,
        },
        {
          id: "u2",
          organization_id: ORG_A,
          email: "b@x.com",
          display_name: "B",
          base_role: "manager",
          created_at: "2026-01-02",
          deleted_at: "2026-02-01",
        },
        {
          id: "u3",
          organization_id: ORG_B,
          email: "c@x.com",
          display_name: "C",
          base_role: "sales_rep",
          created_at: "2026-01-03",
          deleted_at: null,
        },
      ],
    });
    const result = await listUsersInOrg(ORG_A, m.client);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("u1");
  });
});

describe("workspaceCountsForUsers", () => {
  it("counts unique workspaces per user", async () => {
    const m = makeClient({
      user_app_roles: [
        { user_id: "u1", workspace_id: "ws1" },
        { user_id: "u1", workspace_id: "ws2" },
        { user_id: "u1", workspace_id: null },
        { user_id: "u2", workspace_id: "ws1" },
      ],
    });
    const map = await workspaceCountsForUsers(ORG_A, ["u1", "u2"], m.client);
    expect(map.get("u1")).toBe(2);
    expect(map.get("u2")).toBe(1);
  });

  it("returns empty map for empty user_ids", async () => {
    const m = makeClient({});
    const map = await workspaceCountsForUsers(ORG_A, [], m.client);
    expect(map.size).toBe(0);
  });
});

describe("inviteUser", () => {
  it("creates auth user + profile + audit row on a fresh email", async () => {
    const m = makeClient({ email_lookup: null, new_user_id: "new-id" });
    const result = await inviteUser(
      {
        caller_org_id: ORG_A,
        actor_id: ACTOR,
        actor_role: "org_admin",
        input: {
          email: "fresh@x.com",
          display_name: "Fresh",
          base_role: "sales_rep",
        },
      },
      m.client,
    );
    expect(result).toEqual({ user_id: "new-id", created: true });
    expect(m.inserts.profiles[0]).toMatchObject({
      id: "new-id",
      organization_id: ORG_A,
      email: "fresh@x.com",
      display_name: "Fresh",
      base_role: "sales_rep",
    });
    expect(m.inserts.audit_log[0]).toMatchObject({ action: "user_invited" });
  });

  it("is idempotent on existing same-org email (returns existing user_id)", async () => {
    const m = makeClient({
      email_lookup: { id: "existing", organization_id: ORG_A, deleted_at: null },
    });
    const result = await inviteUser(
      {
        caller_org_id: ORG_A,
        actor_id: ACTOR,
        actor_role: "org_admin",
        input: {
          email: "existing@x.com",
          display_name: "Existing",
          base_role: "sales_rep",
        },
      },
      m.client,
    );
    expect(result).toEqual({ user_id: "existing", created: false });
    expect(m.inserts.profiles).toHaveLength(0);
    expect(m.inserts.audit_log).toHaveLength(0);
  });

  it("throws duplicate_email when email belongs to another org", async () => {
    const m = makeClient({
      email_lookup: { id: "other", organization_id: ORG_B, deleted_at: null },
    });
    await expect(
      inviteUser(
        {
          caller_org_id: ORG_A,
          actor_id: ACTOR,
          actor_role: "org_admin",
          input: {
            email: "shared@x.com",
            display_name: "Shared",
            base_role: "sales_rep",
          },
        },
        m.client,
      ),
    ).rejects.toBeInstanceOf(UsersAdminError);
  });
});

describe("changeBaseRole", () => {
  it("updates and audits when target is in own org", async () => {
    const m = makeClient({
      profiles: [
        {
          id: TARGET,
          organization_id: ORG_A,
          email: "t@x.com",
          display_name: "T",
          base_role: "sales_rep",
          created_at: "2026-01-01",
          deleted_at: null,
        },
      ],
    });
    const result = await changeBaseRole(
      {
        caller_org_id: ORG_A,
        actor_id: ACTOR,
        actor_role: "org_admin",
        input: { user_id: TARGET, base_role: "manager" },
      },
      m.client,
    );
    expect(result).toEqual({
      user_id: TARGET,
      from: "sales_rep",
      to: "manager",
    });
    expect(m.updates[0].payload).toMatchObject({ base_role: "manager" });
    expect(m.inserts.audit_log[0]).toMatchObject({ action: "user_role_changed" });
  });

  it("rejects self-target", async () => {
    const m = makeClient({});
    await expect(
      changeBaseRole(
        {
          caller_org_id: ORG_A,
          actor_id: ACTOR,
          actor_role: "org_admin",
          input: { user_id: ACTOR, base_role: "manager" },
        },
        m.client,
      ),
    ).rejects.toBeInstanceOf(UsersAdminError);
  });

  it("rejects cross-tenant (target not visible in caller's org)", async () => {
    const m = makeClient({
      profiles: [
        {
          id: TARGET,
          organization_id: ORG_B,
          email: "t@x.com",
          display_name: "T",
          base_role: "sales_rep",
          created_at: "2026-01-01",
          deleted_at: null,
        },
      ],
    });
    await expect(
      changeBaseRole(
        {
          caller_org_id: ORG_A,
          actor_id: ACTOR,
          actor_role: "org_admin",
          input: { user_id: TARGET, base_role: "manager" },
        },
        m.client,
      ),
    ).rejects.toBeInstanceOf(UsersAdminError);
  });

  it("refuses to change a super_admin's role", async () => {
    const m = makeClient({
      profiles: [
        {
          id: TARGET,
          organization_id: ORG_A,
          email: "sa@x.com",
          display_name: "SA",
          base_role: "super_admin",
          created_at: "2026-01-01",
          deleted_at: null,
        },
      ],
    });
    await expect(
      changeBaseRole(
        {
          caller_org_id: ORG_A,
          actor_id: ACTOR,
          actor_role: "org_admin",
          input: { user_id: TARGET, base_role: "manager" },
        },
        m.client,
      ),
    ).rejects.toBeInstanceOf(UsersAdminError);
  });

  it("no-ops when role is unchanged", async () => {
    const m = makeClient({
      profiles: [
        {
          id: TARGET,
          organization_id: ORG_A,
          email: "t@x.com",
          display_name: "T",
          base_role: "manager",
          created_at: "2026-01-01",
          deleted_at: null,
        },
      ],
    });
    await changeBaseRole(
      {
        caller_org_id: ORG_A,
        actor_id: ACTOR,
        actor_role: "org_admin",
        input: { user_id: TARGET, base_role: "manager" },
      },
      m.client,
    );
    expect(m.updates).toHaveLength(0);
    expect(m.inserts.audit_log).toHaveLength(0);
  });
});

describe("deactivateUser", () => {
  it("soft-deletes profile and bridge rows + writes audit", async () => {
    const m = makeClient({
      profiles: [
        {
          id: TARGET,
          organization_id: ORG_A,
          email: "t@x.com",
          display_name: "T",
          base_role: "sales_rep",
          created_at: "2026-01-01",
          deleted_at: null,
        },
      ],
    });
    await deactivateUser(
      {
        caller_org_id: ORG_A,
        actor_id: ACTOR,
        actor_role: "org_admin",
        input: { user_id: TARGET, reason: "left the company" },
      },
      m.client,
    );
    const profileUpdate = m.updates.find((u) => u.table === "profiles");
    const bridgeUpdate = m.updates.find((u) => u.table === "user_app_roles");
    expect(profileUpdate?.payload.deleted_at).toBeTruthy();
    expect(bridgeUpdate?.payload.deleted_at).toBeTruthy();
    expect(m.inserts.audit_log[0]).toMatchObject({
      action: "user_deactivated",
    });
  });

  it("rejects self-deactivation", async () => {
    const m = makeClient({});
    await expect(
      deactivateUser(
        {
          caller_org_id: ORG_A,
          actor_id: ACTOR,
          actor_role: "org_admin",
          input: { user_id: ACTOR },
        },
        m.client,
      ),
    ).rejects.toBeInstanceOf(UsersAdminError);
  });

  it("refuses to deactivate a super_admin", async () => {
    const m = makeClient({
      profiles: [
        {
          id: TARGET,
          organization_id: ORG_A,
          email: "sa@x.com",
          display_name: "SA",
          base_role: "super_admin",
          created_at: "2026-01-01",
          deleted_at: null,
        },
      ],
    });
    await expect(
      deactivateUser(
        {
          caller_org_id: ORG_A,
          actor_id: ACTOR,
          actor_role: "org_admin",
          input: { user_id: TARGET },
        },
        m.client,
      ),
    ).rejects.toBeInstanceOf(UsersAdminError);
  });
});
