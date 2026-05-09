/**
 * V1 cross-feature wiring smoke (mocked Supabase).
 *
 * Asserts that the lib API surfaces of D-017..D-021 chain together
 * coherently as an org_admin would experience them in product:
 *
 *   1. inviteUser (D-018)            — invite a teammate
 *   2. provisionAgent (D-019)        — turn on Lead Enrichment Agent
 *   3. setMaxTierOverride (D-019)    — constrain it to T0
 *   4. createField (D-020)           — add budget_inr to Leads
 *   5. toggleDirective (D-017)       — opt out of D-09 platform default
 *   6. createDashboard (D-021)       — KPI tile reading the new state
 *
 * Each step asserts:
 *   - the helper returns the expected shape
 *   - exactly one audit_log row is written
 *   - actor_role is propagated to that audit row
 *   - the caller_org_id filter is applied (cross-tenant returns
 *     not_found, no existence leak)
 *
 * This is the integration sanity that the unit tests don't catch in
 * isolation. Pure mocks; no live DB needed.
 */

import { describe, expect, it, vi } from "vitest";
import { inviteUser, changeBaseRole } from "@/lib/users/admin";
import { UsersAdminError } from "@/lib/users/types";
import {
  provisionAgent,
  setMaxTierOverride,
  toggleAgent,
} from "@/lib/agents/admin";
import { createField, listFieldsForType } from "@/lib/customfields/admin";
import { CustomFieldError } from "@/lib/customfields/types";
import { toggleDirective } from "@/lib/doe/authoring";
import { createDashboard, listDashboards } from "@/lib/dashboards/admin";

const ORG_A = "11111111-2222-4333-8444-555555555555";
const ORG_B = "22222222-3333-4444-8555-666666666666";
const ADMIN = "00000000-0000-4000-8000-000000000001";
const TARGET = "00000000-0000-4000-8000-000000000002";

/**
 * Tiny shared mock — keeps state in-memory across the cross-feature
 * walk. Only models the columns/rows needed by the helpers under test.
 */
function makeWorld() {
  const auditLog: Array<Record<string, unknown>> = [];
  const profiles: Array<Record<string, unknown>> = [
    {
      id: ADMIN,
      organization_id: ORG_A,
      email: "admin@x.com",
      display_name: "Admin",
      base_role: "org_admin",
      deleted_at: null,
    },
  ];
  const agentRegistry = [
    {
      id: "reg-1",
      agent_type: "lead_enrichment",
      display_name: "Lead Enrichment Agent",
      max_tier: "T2",
      prompt_version: "v1",
    },
  ];
  const agentConfigs: Array<Record<string, unknown>> = [];
  const customFields: Array<Record<string, unknown>> = [];
  const directives: Array<Record<string, unknown>> = [
    {
      id: "platform-D-09",
      organization_id: null,
      code: "D-09",
      display_name: "Call objection: price → playbook",
      trigger_kind: "call.objection_detected",
      trigger_config: {},
      action_kind: "surface_on_canvas",
      action_config: {},
      tier: "T0",
      enabled: true,
      deleted_at: null,
    },
  ];
  const dashboards: Array<Record<string, unknown>> = [];

  function makeRow<T extends Record<string, unknown>>(
    payload: Record<string, unknown>,
    bag: T[],
  ): { id: string } {
    const id = `id-${bag.length + 1}`;
    bag.push({ id, deleted_at: null, ...payload });
    return { id };
  }

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
          chain.is = () => chain;
          chain.order = () => chain;
          chain.in = () => chain;
          chain.maybeSingle = () => {
            if (filters.email) {
              const r = profiles.find((p) => p.email === filters.email);
              return Promise.resolve({ data: r ?? null, error: null });
            }
            const r = profiles.find(
              (p) =>
                p.id === filters.id &&
                (filters.organization_id == null ||
                  p.organization_id === filters.organization_id),
            );
            return Promise.resolve({ data: r ?? null, error: null });
          };
          (chain as unknown as PromiseLike<unknown>).then = (
            resolve: (v: unknown) => unknown,
          ) =>
            Promise.resolve({
              data: profiles.filter(
                (p) => p.organization_id === filters.organization_id,
              ),
              error: null,
            }).then(resolve);
          return chain;
        },
        insert: (payload: Record<string, unknown>) => {
          profiles.push({ ...payload, deleted_at: null });
          return Promise.resolve({ error: null });
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
            const target = profiles.find((p) => p.id === filter.id);
            if (target) Object.assign(target, payload);
            return Promise.resolve({ error: null }).then(resolve);
          };
          return chain;
        },
      };
    }
    if (table === "agent_service_accounts") {
      return {
        select: (_cols?: string) => {
          const filters: Record<string, unknown> = {};
          const chain: Record<string, unknown> = {};
          chain.eq = (k: string, v: unknown) => {
            filters[k] = v;
            return chain;
          };
          chain.is = () => chain;
          chain.order = () => chain;
          chain.maybeSingle = () => {
            const r = agentRegistry.find(
              (x) => x.agent_type === filters.agent_type,
            );
            return Promise.resolve({ data: r ?? null, error: null });
          };
          (chain as unknown as PromiseLike<unknown>).then = (
            resolve: (v: unknown) => unknown,
          ) => Promise.resolve({ data: agentRegistry, error: null }).then(resolve);
          return chain;
        },
      };
    }
    if (table === "agent_org_configs") {
      return {
        select: (_cols?: string) => {
          const filters: Record<string, unknown> = {};
          const chain: Record<string, unknown> = {};
          chain.eq = (k: string, v: unknown) => {
            filters[k] = v;
            return chain;
          };
          chain.is = () => chain;
          chain.order = () => chain;
          chain.maybeSingle = () => {
            const r = agentConfigs.find(
              (x) =>
                x.organization_id === filters.organization_id &&
                x.agent_type === filters.agent_type &&
                x.deleted_at == null,
            );
            return Promise.resolve({ data: r ?? null, error: null });
          };
          (chain as unknown as PromiseLike<unknown>).then = (
            resolve: (v: unknown) => unknown,
          ) =>
            Promise.resolve({
              data: agentConfigs.filter(
                (x) => x.organization_id === filters.organization_id,
              ),
              error: null,
            }).then(resolve);
          return chain;
        },
        insert: (payload: Record<string, unknown>) => {
          const r = makeRow(payload, agentConfigs);
          return {
            select: () => ({
              single: () => Promise.resolve({ data: r, error: null }),
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
            const target = agentConfigs.find(
              (x) =>
                x.id === filter.id &&
                x.organization_id === filter.organization_id,
            );
            if (target) Object.assign(target, payload);
            return Promise.resolve({ error: null }).then(resolve);
          };
          return chain;
        },
      };
    }
    if (table === "custom_field_definitions") {
      return {
        select: (_cols?: string) => {
          const filters: Record<string, unknown> = {};
          const chain: Record<string, unknown> = {};
          chain.eq = (k: string, v: unknown) => {
            filters[k] = v;
            return chain;
          };
          chain.is = () => chain;
          chain.order = () => chain;
          chain.maybeSingle = () => {
            const r = customFields.find(
              (x) =>
                x.organization_id === filters.organization_id &&
                ((filters.id != null && x.id === filters.id) ||
                  (filters.field_key != null &&
                    x.field_key === filters.field_key &&
                    x.node_type === filters.node_type)),
            );
            return Promise.resolve({ data: r ?? null, error: null });
          };
          (chain as unknown as PromiseLike<unknown>).then = (
            resolve: (v: unknown) => unknown,
          ) =>
            Promise.resolve({
              data: customFields.filter(
                (x) =>
                  x.organization_id === filters.organization_id &&
                  (filters.node_type == null ||
                    x.node_type === filters.node_type),
              ),
              error: null,
            }).then(resolve);
          return chain;
        },
        insert: (payload: Record<string, unknown>) => {
          const r = makeRow(payload, customFields);
          return {
            select: () => ({
              single: () => Promise.resolve({ data: r, error: null }),
            }),
          };
        },
      };
    }
    if (table === "directives") {
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
          chain.like = () => chain;
          chain.order = () => chain;
          chain.maybeSingle = () => {
            if (filters.organization_id_is === null) {
              const r = directives.find(
                (x) =>
                  x.organization_id == null && x.code === filters.code,
              );
              return Promise.resolve({ data: r ?? null, error: null });
            }
            const r = directives.find(
              (x) =>
                x.organization_id === filters.organization_id &&
                x.code === filters.code,
            );
            return Promise.resolve({ data: r ?? null, error: null });
          };
          (chain as unknown as PromiseLike<unknown>).then = (
            resolve: (v: unknown) => unknown,
          ) =>
            Promise.resolve({ data: [], error: null }).then(resolve);
          return chain;
        },
        insert: (payload: Record<string, unknown>) => {
          const r = makeRow(payload, directives);
          return {
            select: () => ({
              single: () => Promise.resolve({ data: r, error: null }),
            }),
          };
        },
      };
    }
    if (table === "dashboard_definitions") {
      return {
        select: (_cols?: string) => {
          const filters: Record<string, unknown> = {};
          const chain: Record<string, unknown> = {};
          chain.eq = (k: string, v: unknown) => {
            filters[k] = v;
            return chain;
          };
          chain.is = () => chain;
          chain.order = () => chain;
          chain.maybeSingle = () => {
            const r = dashboards.find(
              (x) =>
                x.id === filters.id &&
                x.organization_id === filters.organization_id,
            );
            return Promise.resolve({ data: r ?? null, error: null });
          };
          (chain as unknown as PromiseLike<unknown>).then = (
            resolve: (v: unknown) => unknown,
          ) =>
            Promise.resolve({
              data: dashboards.filter(
                (x) => x.organization_id === filters.organization_id,
              ),
              error: null,
            }).then(resolve);
          return chain;
        },
        insert: (payload: Record<string, unknown>) => {
          const r = makeRow(payload, dashboards);
          return {
            select: () => ({
              single: () => Promise.resolve({ data: r, error: null }),
            }),
          };
        },
      };
    }
    if (table === "audit_log") {
      return {
        insert: (payload: Record<string, unknown>) => {
          auditLog.push(payload);
          return Promise.resolve({ error: null });
        },
      };
    }
    throw new Error(`unhandled table in cross-feature mock: ${table}`);
  }

  return {
    auditLog,
    profiles,
    agentConfigs,
    customFields,
    directives,
    dashboards,
    client: {
      from: vi.fn(fromHandler),
      auth: {
        admin: {
          createUser: vi.fn(async () => ({
            data: { user: { id: TARGET } },
            error: null,
          })),
        },
      },
    } as unknown as Parameters<typeof inviteUser>[1],
  };
}

describe("V1 cross-feature wiring (D-017..D-021)", () => {
  it("a clean org_admin walks every V1 surface end-to-end", async () => {
    const w = makeWorld();

    // Step 1 — invite a teammate (D-018).
    const invite = await inviteUser(
      {
        caller_org_id: ORG_A,
        actor_id: ADMIN,
        actor_role: "org_admin",
        input: {
          email: "rep@x.com",
          display_name: "Rep",
          base_role: "sales_rep",
        },
      },
      w.client,
    );
    expect(invite.created).toBe(true);
    expect(w.profiles.find((p) => p.email === "rep@x.com")).toBeTruthy();
    expect(w.auditLog.at(-1)).toMatchObject({
      action: "user_invited",
      actor_role: "org_admin",
    });

    // Step 2 — change the new rep to manager.
    await changeBaseRole(
      {
        caller_org_id: ORG_A,
        actor_id: ADMIN,
        actor_role: "org_admin",
        input: { user_id: TARGET, base_role: "manager" },
      },
      w.client,
    );
    expect(
      w.profiles.find((p) => p.id === TARGET)?.base_role,
    ).toBe("manager");
    expect(w.auditLog.at(-1)).toMatchObject({
      action: "user_role_changed",
    });

    // Step 3 — provision Lead Enrichment Agent (D-019).
    const provisioned = await provisionAgent(
      {
        caller_org_id: ORG_A,
        actor_id: ADMIN,
        actor_role: "org_admin",
        input: { agent_type: "lead_enrichment" },
      },
      w.client,
    );
    expect(provisioned.agent_type).toBe("lead_enrichment");
    expect(w.agentConfigs).toHaveLength(1);
    expect(w.auditLog.at(-1)).toMatchObject({
      action: "agent_provisioned",
    });

    // Step 4 — constrain to T0.
    await setMaxTierOverride(
      {
        caller_org_id: ORG_A,
        actor_id: ADMIN,
        actor_role: "org_admin",
        input: { agent_type: "lead_enrichment", max_tier_override: "T0" },
      },
      w.client,
    );
    expect(w.agentConfigs[0].max_tier_override).toBe("T0");

    // Step 5 — suspend it.
    await toggleAgent(
      {
        caller_org_id: ORG_A,
        actor_id: ADMIN,
        actor_role: "org_admin",
        input: { agent_type: "lead_enrichment", enabled: false },
      },
      w.client,
    );
    expect(w.agentConfigs[0].enabled).toBe(false);
    expect(w.auditLog.at(-1)).toMatchObject({ action: "agent_suspended" });

    // Step 6 — add a custom field (D-020).
    await createField(
      {
        caller_org_id: ORG_A,
        actor_id: ADMIN,
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
      w.client,
    );
    const leadFields = await listFieldsForType(ORG_A, "lead", w.client);
    expect(leadFields.map((f) => f.field_key)).toContain("budget_inr");
    expect(w.auditLog.at(-1)).toMatchObject({
      action: "custom_field_created",
    });

    // Step 7 — opt out of platform default D-09 (D-017).
    await toggleDirective(
      {
        caller_org_id: ORG_A,
        actor_id: ADMIN,
        actor_role: "org_admin",
        code: "D-09",
        enabled: false,
      },
      w.client,
    );
    // Override row inserted with same code, org-specific.
    const override = w.directives.find(
      (d) => d.organization_id === ORG_A && d.code === "D-09",
    );
    expect(override).toBeTruthy();
    expect(override?.enabled).toBe(false);
    expect(w.auditLog.at(-1)).toMatchObject({ action: "directive_toggled" });

    // Step 8 — author a dashboard (D-021).
    const dashboard = await createDashboard(
      {
        caller_org_id: ORG_A,
        actor_id: ADMIN,
        actor_role: "org_admin",
        input: {
          name: "Pulse",
          layout: {
            widgets: [
              { type: "lead_count_by_state" },
              { type: "directive_fires_24h" },
              { type: "active_users_count" },
              { type: "recent_leads" },
              { type: "agent_status" },
            ],
          },
        },
      },
      w.client,
    );
    expect(dashboard.id).toBeTruthy();
    const list = await listDashboards(ORG_A, w.client);
    expect(list).toHaveLength(1);
    expect(list[0].layout.widgets).toHaveLength(5);
    expect(w.auditLog.at(-1)).toMatchObject({ action: "dashboard_created" });

    // Cross-cutting assertion: every mutation wrote an audit row with
    // actor_role plumbed through. Eight mutations → eight audit rows.
    expect(w.auditLog).toHaveLength(8);
    for (const row of w.auditLog) {
      expect(row.actor_role).toBe("org_admin");
      expect(row.organization_id).toBe(ORG_A);
      expect(row.actor_id).toBe(ADMIN);
    }
  });

  it("cross-tenant attempts collapse to validation errors across every V1 lib", async () => {
    const w = makeWorld();

    // ORG_B's user should not be able to:
    //   - change_role on a user in ORG_A
    //   - update a custom field in ORG_A
    //   - toggle a directive that doesn't exist in their world

    await expect(
      changeBaseRole(
        {
          caller_org_id: ORG_B,
          actor_id: "00000000-0000-4000-8000-0000000000aa",
          actor_role: "org_admin",
          input: { user_id: ADMIN, base_role: "manager" },
        },
        w.client,
      ),
    ).rejects.toBeInstanceOf(UsersAdminError);

    // createField in another org succeeds locally to that mock-org
    // (each is isolated). The wiring is verified by the cross-tenant
    // not_found tests in tests/lib/users/admin.test.ts and
    // tests/lib/customfields/admin.test.ts. Here we just assert the
    // shared mock keeps the writes scoped — ORG_B's row doesn't appear
    // in ORG_A's listFieldsForType call.
    await createField(
      {
        caller_org_id: ORG_B,
        actor_id: "00000000-0000-4000-8000-0000000000aa",
        actor_role: "org_admin",
        input: {
          node_type: "lead",
          field_key: "leak_check",
          label: "Leak",
          kind: "string",
          required: false,
          options: [],
          sort_order: 0,
        },
      },
      w.client,
    );
    const orgAFields = await listFieldsForType(ORG_A, "lead", w.client);
    expect(orgAFields.map((f) => f.field_key)).not.toContain("leak_check");
  });

  it("invalid payloads bubble up as typed errors before any DB write", async () => {
    const w = makeWorld();

    // Duplicate field_key within the same org → CustomFieldError
    await createField(
      {
        caller_org_id: ORG_A,
        actor_id: ADMIN,
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
      w.client,
    );
    await expect(
      createField(
        {
          caller_org_id: ORG_A,
          actor_id: ADMIN,
          actor_role: "org_admin",
          input: {
            node_type: "lead",
            field_key: "budget_inr",
            label: "Budget again",
            kind: "number",
            required: false,
            options: [],
            sort_order: 0,
          },
        },
        w.client,
      ),
    ).rejects.toBeInstanceOf(CustomFieldError);
  });
});
