import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  surface_on_canvas: vi.fn(),
  flag_lead: vi.fn(),
}));
vi.mock("@/lib/doe/actions", () => ({
  ACTION_HANDLERS: {
    surface_on_canvas: mocks.surface_on_canvas,
    flag_lead: mocks.flag_lead,
    send_template_message: vi.fn(),
    notify_user: vi.fn(),
    attach_node: vi.fn(),
    enqueue_agent: vi.fn(),
  },
}));

import { dispatchDirective } from "@/lib/doe/runtime";
import type { DirectiveRow, Trigger } from "@/lib/doe/types";

const ORG = "11111111-2222-4333-8444-555555555555";
const WS = "22222222-3333-4444-8555-666666666666";
const LEAD = "33333333-4444-4555-8666-777777777777";

type Inserts = {
  directive_invocations: Array<Record<string, unknown>>;
  audit_log: Array<Record<string, unknown>>;
};

function makeClient(opts: {
  directives: DirectiveRow[];
  existing_dispatched_invocation?: boolean;
  rate_limit_count?: number;
}) {
  const inserts: Inserts = {
    directive_invocations: [],
    audit_log: [],
  };

  const directivesChain = {
    select: vi.fn(() => directivesChain),
    eq: vi.fn(() => directivesChain),
    is: vi.fn(() => Promise.resolve({ data: opts.directives, error: null })),
  };

  // The runtime makes two queries against directive_invocations:
  //   1. idempotency check — terminal `.limit(1)` returning `data: []`
  //      or `data: [{id: 'x'}]`.
  //   2. rate-limit count — terminal `.gte(...)` returning `count: N`.
  //
  // We thread a query-shape detector to dispatch correctly.

  function makeInvocationsChain() {
    type Resp = Promise<{ data: unknown; error: unknown; count?: number }>;
    const chain: Record<string, unknown> = {};
    const idempotencyResp: Resp = Promise.resolve({
      data: opts.existing_dispatched_invocation ? [{ id: "x" }] : [],
      error: null,
    });
    const rateLimitResp: Resp = Promise.resolve({
      data: null,
      count: opts.rate_limit_count ?? 0,
      error: null,
    });
    Object.assign(chain, {
      select: vi.fn((_: unknown, options?: { count?: string; head?: boolean }) => {
        const isCount = options?.head === true;
        const subChain: Record<string, unknown> = {};
        Object.assign(subChain, {
          eq: vi.fn(() => subChain),
          is: vi.fn(() => subChain),
          gte: vi.fn(() => (isCount ? rateLimitResp : idempotencyResp)),
          limit: vi.fn(() => idempotencyResp),
        });
        return subChain;
      }),
      insert: vi.fn((row: Record<string, unknown>) => {
        inserts.directive_invocations.push(row);
        return Promise.resolve({ error: null });
      }),
    });
    return chain;
  }

  const invocationsChain = makeInvocationsChain();

  const client = {
    from: vi.fn((table: string) => {
      if (table === "directives") return directivesChain;
      if (table === "directive_invocations") return invocationsChain;
      if (table === "audit_log") {
        return {
          insert: vi.fn((row: Record<string, unknown>) => {
            inserts.audit_log.push(row);
            return Promise.resolve({ error: null });
          }),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    }),
  };
  return { client, inserts };
}

const baseTrigger: Trigger = {
  kind: "lead.created",
  trigger_id: "lead.created:lead-1",
  organization_id: ORG,
  workspace_id: WS,
  subject_node_id: LEAD,
  payload: { lead_id: LEAD },
};

const baseDirective: DirectiveRow = {
  id: "dir-1",
  organization_id: null,
  code: "D-15",
  display_name: "walk-in attach showroom",
  trigger_kind: "lead.created",
  trigger_config: {},
  action_kind: "surface_on_canvas",
  action_config: {},
  tier: "T0",
  enabled: true,
};

beforeEach(() => {
  mocks.surface_on_canvas.mockReset();
  mocks.surface_on_canvas.mockResolvedValue({ created_node_id: "note-1" });
  mocks.flag_lead.mockReset();
  mocks.flag_lead.mockResolvedValue({ flagged: true, event_to_emit: null });
});

describe("dispatchDirective", () => {
  it("dispatches a matching T0 directive — happy path", async () => {
    const { client, inserts } = makeClient({ directives: [baseDirective] });
    const out = await dispatchDirective(baseTrigger, { client: client as never });

    expect(out).toHaveLength(1);
    expect(out[0].outcome).toBe("dispatched");
    expect(mocks.surface_on_canvas).toHaveBeenCalledTimes(1);

    expect(inserts.directive_invocations).toHaveLength(1);
    expect(inserts.directive_invocations[0].outcome).toBe("dispatched");
    expect(inserts.audit_log).toHaveLength(1);
    expect(inserts.audit_log[0].action).toBe("directive_fired");
  });

  it("skips disabled directives", async () => {
    const { client, inserts } = makeClient({
      directives: [{ ...baseDirective, enabled: false }],
    });
    const out = await dispatchDirective(baseTrigger, { client: client as never });

    expect(out[0].outcome).toBe("skipped_disabled");
    expect(mocks.surface_on_canvas).not.toHaveBeenCalled();
    expect(inserts.directive_invocations[0].outcome).toBe("skipped_disabled");
  });

  it("skips when condition fails", async () => {
    const d: DirectiveRow = {
      ...baseDirective,
      trigger_config: { source: "walkin" },
    };
    const { client, inserts } = makeClient({ directives: [d] });
    const out = await dispatchDirective(
      { ...baseTrigger, payload: { lead_id: LEAD, source: "magicbricks" } },
      { client: client as never }
    );

    expect(out[0].outcome).toBe("skipped_condition");
    expect(mocks.surface_on_canvas).not.toHaveBeenCalled();
    expect(inserts.directive_invocations[0].outcome).toBe("skipped_condition");
  });

  it("skips T3+ directives as pending_approval", async () => {
    const d: DirectiveRow = { ...baseDirective, tier: "T3" };
    const { client, inserts } = makeClient({ directives: [d] });
    const out = await dispatchDirective(baseTrigger, { client: client as never });

    expect(out[0].outcome).toBe("pending_approval");
    expect(mocks.surface_on_canvas).not.toHaveBeenCalled();
    expect(inserts.directive_invocations[0].outcome).toBe("pending_approval");
  });

  it("returns dispatched array with multiple directives", async () => {
    const d2: DirectiveRow = {
      ...baseDirective,
      id: "dir-2",
      code: "D-15-extra",
      action_kind: "flag_lead",
      tier: "T1",
    };
    const { client } = makeClient({ directives: [baseDirective, d2] });
    const out = await dispatchDirective(baseTrigger, { client: client as never });

    expect(out).toHaveLength(2);
    expect(out.map((r) => r.outcome)).toEqual(["dispatched", "dispatched"]);
    expect(mocks.surface_on_canvas).toHaveBeenCalledTimes(1);
    expect(mocks.flag_lead).toHaveBeenCalledTimes(1);
  });

  it("rate-limits when ≥ 100 dispatches in 24h", async () => {
    const { client, inserts } = makeClient({
      directives: [baseDirective],
      rate_limit_count: 100,
    });
    const out = await dispatchDirective(baseTrigger, { client: client as never });

    expect(out[0].outcome).toBe("rate_limited");
    expect(mocks.surface_on_canvas).not.toHaveBeenCalled();
    expect(inserts.directive_invocations[0].outcome).toBe("rate_limited");
  });

  it("skips when an existing dispatched invocation already exists (idempotent)", async () => {
    const { client, inserts } = makeClient({
      directives: [baseDirective],
      existing_dispatched_invocation: true,
    });
    const out = await dispatchDirective(baseTrigger, { client: client as never });

    expect(out[0].outcome).toBe("skipped_idempotent");
    expect(mocks.surface_on_canvas).not.toHaveBeenCalled();
    expect(inserts.directive_invocations[0].outcome).toBe("skipped_idempotent");
  });
});
