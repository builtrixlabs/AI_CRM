import { describe, expect, it, vi } from "vitest";
import {
  AgentAdminError,
  effectiveMaxTier,
  getOrgAgentConfig,
  listAgentSurface,
  provisionAgent,
  setMaxTierOverride,
  toggleAgent,
  type AgentOrgConfigRow,
  type AgentRegistryRow,
} from "@/lib/agents/admin";

const ORG_A = "11111111-2222-4333-8444-555555555555";
const ACTOR = "33333333-4444-4555-8666-777777777777";

function makeClient(opts: {
  registry?: AgentRegistryRow[];
  configs?: AgentOrgConfigRow[];
  insert_id?: string;
  insert_error?: string;
  update_error?: string;
}) {
  const inserts: Array<Record<string, unknown>> = [];
  const audit: Array<Record<string, unknown>> = [];
  const updates: Array<{ payload: Record<string, unknown>; filter: Record<string, unknown> }> = [];

  function fromHandler(table: string) {
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
            const r = (opts.registry ?? []).find(
              (x) => x.agent_type === filters.agent_type,
            );
            return Promise.resolve({ data: r ?? null, error: null });
          };
          (chain as unknown as PromiseLike<unknown>).then = (resolve: (v: unknown) => unknown) =>
            Promise.resolve({ data: opts.registry ?? [], error: null }).then(resolve);
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
          chain.is = (k: string, v: unknown) => {
            filters[`${k}_is`] = v;
            return chain;
          };
          chain.order = () => chain;
          chain.maybeSingle = () => {
            const r = (opts.configs ?? []).find(
              (x) =>
                x.organization_id === filters.organization_id &&
                x.agent_type === filters.agent_type,
            );
            return Promise.resolve({ data: r ?? null, error: null });
          };
          (chain as unknown as PromiseLike<unknown>).then = (resolve: (v: unknown) => unknown) => {
            const filtered = (opts.configs ?? []).filter(
              (c) => c.organization_id === filters.organization_id,
            );
            return Promise.resolve({ data: filtered, error: null }).then(resolve);
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
          (chain as unknown as PromiseLike<unknown>).then = (resolve: (v: unknown) => unknown) => {
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
    client: { from: vi.fn(fromHandler) } as unknown as Parameters<typeof toggleAgent>[1],
  };
}

const REG: AgentRegistryRow = {
  id: "reg1",
  agent_type: "lead_enrichment",
  display_name: "Lead Enrichment Agent",
  max_tier: "T2",
  prompt_version: "v1",
};

describe("effectiveMaxTier", () => {
  it("returns global when override is null", () => {
    expect(effectiveMaxTier("T2", null)).toBe("T2");
  });
  it("returns lower of the two", () => {
    expect(effectiveMaxTier("T2", "T1")).toBe("T1");
    expect(effectiveMaxTier("T1", "T2")).toBe("T1");
  });
});

describe("listAgentSurface", () => {
  it("merges registry + config rows with derived status", async () => {
    const m = makeClient({
      registry: [REG],
      configs: [
        {
          id: "c1",
          organization_id: ORG_A,
          agent_type: "lead_enrichment",
          enabled: false,
          max_tier_override: "T1",
          suspended_at: "2026-05-09",
          suspended_reason: "noisy",
        },
      ],
    });
    const surface = await listAgentSurface(ORG_A, m.client);
    expect(surface).toHaveLength(1);
    expect(surface[0].status).toBe("suspended");
    expect(surface[0].effective_max_tier).toBe("T1");
  });

  it("marks unprovisioned agents as not_provisioned", async () => {
    const m = makeClient({ registry: [REG], configs: [] });
    const surface = await listAgentSurface(ORG_A, m.client);
    expect(surface[0].status).toBe("not_provisioned");
    expect(surface[0].effective_max_tier).toBe("T2");
  });
});

describe("provisionAgent", () => {
  it("creates a config row + audit on first provision", async () => {
    const m = makeClient({ registry: [REG], configs: [], insert_id: "new" });
    const r = await provisionAgent(
      {
        caller_org_id: ORG_A,
        actor_id: ACTOR,
        actor_role: "org_admin",
        input: { agent_type: "lead_enrichment" },
      },
      m.client,
    );
    expect(r).toEqual({ id: "new", agent_type: "lead_enrichment" });
    expect(m.inserts).toHaveLength(1);
    expect(m.audit[0]).toMatchObject({ action: "agent_provisioned" });
  });

  it("is idempotent when config already exists", async () => {
    const m = makeClient({
      registry: [REG],
      configs: [
        {
          id: "existing",
          organization_id: ORG_A,
          agent_type: "lead_enrichment",
          enabled: true,
          max_tier_override: null,
          suspended_at: null,
          suspended_reason: null,
        },
      ],
    });
    const r = await provisionAgent(
      {
        caller_org_id: ORG_A,
        actor_id: ACTOR,
        actor_role: "org_admin",
        input: { agent_type: "lead_enrichment" },
      },
      m.client,
    );
    expect(r.id).toBe("existing");
    expect(m.inserts).toHaveLength(0);
    expect(m.audit).toHaveLength(0);
  });

  it("rejects unknown agent_type", async () => {
    const m = makeClient({ registry: [REG], configs: [] });
    await expect(
      provisionAgent(
        {
          caller_org_id: ORG_A,
          actor_id: ACTOR,
          actor_role: "org_admin",
          input: { agent_type: "no_such_agent" },
        },
        m.client,
      ),
    ).rejects.toBeInstanceOf(AgentAdminError);
  });
});

describe("toggleAgent", () => {
  it("suspends a provisioned agent + writes audit", async () => {
    const m = makeClient({
      configs: [
        {
          id: "c1",
          organization_id: ORG_A,
          agent_type: "lead_enrichment",
          enabled: true,
          max_tier_override: null,
          suspended_at: null,
          suspended_reason: null,
        },
      ],
    });
    await toggleAgent(
      {
        caller_org_id: ORG_A,
        actor_id: ACTOR,
        actor_role: "org_admin",
        input: {
          agent_type: "lead_enrichment",
          enabled: false,
          suspended_reason: "debug",
        },
      },
      m.client,
    );
    expect(m.updates[0].payload.enabled).toBe(false);
    expect(m.updates[0].payload.suspended_reason).toBe("debug");
    expect(m.audit[0]).toMatchObject({ action: "agent_suspended" });
  });

  it("rejects toggle on unprovisioned agent", async () => {
    const m = makeClient({ configs: [] });
    await expect(
      toggleAgent(
        {
          caller_org_id: ORG_A,
          actor_id: ACTOR,
          actor_role: "org_admin",
          input: { agent_type: "lead_enrichment", enabled: false },
        },
        m.client,
      ),
    ).rejects.toBeInstanceOf(AgentAdminError);
  });
});

describe("setMaxTierOverride", () => {
  it("sets override + writes audit", async () => {
    const m = makeClient({
      registry: [REG],
      configs: [
        {
          id: "c1",
          organization_id: ORG_A,
          agent_type: "lead_enrichment",
          enabled: true,
          max_tier_override: null,
          suspended_at: null,
          suspended_reason: null,
        },
      ],
    });
    await setMaxTierOverride(
      {
        caller_org_id: ORG_A,
        actor_id: ACTOR,
        actor_role: "org_admin",
        input: { agent_type: "lead_enrichment", max_tier_override: "T1" },
      },
      m.client,
    );
    expect(m.updates[0].payload.max_tier_override).toBe("T1");
    expect(m.audit[0]).toMatchObject({ action: "agent_tier_set" });
  });

  it("refuses override above global max", async () => {
    const m = makeClient({
      registry: [REG],
      configs: [
        {
          id: "c1",
          organization_id: ORG_A,
          agent_type: "lead_enrichment",
          enabled: true,
          max_tier_override: null,
          suspended_at: null,
          suspended_reason: null,
        },
      ],
    });
    await expect(
      setMaxTierOverride(
        {
          caller_org_id: ORG_A,
          actor_id: ACTOR,
          actor_role: "org_admin",
          input: { agent_type: "lead_enrichment", max_tier_override: "T4" },
        },
        m.client,
      ),
    ).rejects.toBeInstanceOf(AgentAdminError);
  });
});

describe("getOrgAgentConfig", () => {
  it("returns null when not provisioned", async () => {
    const m = makeClient({ configs: [] });
    const r = await getOrgAgentConfig(ORG_A, "lead_enrichment", m.client);
    expect(r).toBeNull();
  });
});
