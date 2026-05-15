import { describe, expect, it } from "vitest";
import {
  listPendingWorkflows,
  approveWorkflow,
  rejectWorkflow,
  WORKFLOW_REJECTION_MIN_REASON,
  DirectiveAuthoringError,
} from "@/lib/doe/authoring";

const ORG_A = "11111111-2222-4333-8444-555555555555";
const ORG_B = "22222222-3333-4444-8555-666666666666";
const ACTOR = "33333333-4444-4555-8666-777777777777";
const DIRECTIVE = "44444444-5555-4666-8777-888888888888";

function makeClient(opts: {
  pending?: Array<Record<string, unknown>>;
  row?: {
    id: string;
    code: string;
    lifecycle_status: string;
    organization_id: string;
  } | null;
  update_error?: string;
}) {
  const updates: Array<{
    payload: Record<string, unknown>;
    filter: Record<string, unknown>;
  }> = [];
  const audit: Array<Record<string, unknown>> = [];

  function directivesHandler() {
    return {
      select: () => {
        const chain: Record<string, unknown> = {};
        Object.assign(chain, {
          eq: () => chain,
          is: () => chain,
          order: () => chain,
          // loadPendingForDecision terminates with .maybeSingle()
          maybeSingle: () =>
            Promise.resolve({ data: opts.row ?? null, error: null }),
          // listPendingWorkflows awaits the chain after .order()
          then: (resolve: (v: unknown) => unknown) =>
            Promise.resolve({
              data: opts.pending ?? [],
              error: null,
            }).then(resolve),
        });
        return chain;
      },
      update: (payload: Record<string, unknown>) => {
        const filter: Record<string, unknown> = {};
        const ret: Record<string, unknown> = {};
        Object.assign(ret, {
          eq: (k: string, v: unknown) => {
            filter[k] = v;
            return ret;
          },
          then: (resolve: (v: unknown) => unknown) => {
            updates.push({ payload, filter });
            return Promise.resolve({
              error: opts.update_error
                ? { message: opts.update_error }
                : null,
            }).then(resolve);
          },
        });
        return ret;
      },
    };
  }

  return {
    updates,
    audit,
    client: {
      from: (table: string) => {
        if (table === "directives") return directivesHandler();
        if (table === "audit_log") {
          return {
            insert: (row: Record<string, unknown>) => {
              audit.push(row);
              return Promise.resolve({ error: null });
            },
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    },
  };
}

function pendingRow(over: Record<string, unknown> = {}) {
  return {
    id: DIRECTIVE,
    code: "C-07",
    lifecycle_status: "pending_approval",
    organization_id: ORG_A,
    ...over,
  };
}

describe("listPendingWorkflows", () => {
  it("returns the org's pending rows", async () => {
    const m = makeClient({
      pending: [
        {
          id: DIRECTIVE,
          code: "C-07",
          display_name: "Manager workflow",
          trigger_kind: "lead.created",
          action_kind: "flag_lead",
          tier: "T1",
          submitted_by: ACTOR,
          submitted_at: "2026-05-15T00:00:00Z",
          created_at: "2026-05-15T00:00:00Z",
        },
      ],
    });
    const rows = await listPendingWorkflows(ORG_A, m.client as never);
    expect(rows).toHaveLength(1);
    expect(rows[0].code).toBe("C-07");
  });

  it("returns [] when there are no pending workflows", async () => {
    const m = makeClient({ pending: [] });
    expect(await listPendingWorkflows(ORG_A, m.client as never)).toEqual([]);
  });
});

describe("approveWorkflow", () => {
  it("transitions a pending workflow to live + enabled, audit-logged (AC-4)", async () => {
    const m = makeClient({ row: pendingRow() });
    const r = await approveWorkflow(
      {
        caller_org_id: ORG_A,
        actor_id: ACTOR,
        actor_role: "org_admin",
        directive_id: DIRECTIVE,
      },
      m.client as never,
    );
    expect(r).toEqual({
      id: DIRECTIVE,
      code: "C-07",
      lifecycle_status: "live",
    });
    expect(m.updates).toHaveLength(1);
    expect(m.updates[0].payload.lifecycle_status).toBe("live");
    expect(m.updates[0].payload.enabled).toBe(true);
    expect(m.updates[0].payload.decided_by).toBe(ACTOR);
    expect(m.updates[0].filter.organization_id).toBe(ORG_A);
    expect(m.audit).toHaveLength(1);
    expect(m.audit[0].action).toBe("workflow_approved");
  });

  it("throws conflict when the workflow is not pending (AC-4)", async () => {
    const m = makeClient({ row: pendingRow({ lifecycle_status: "live" }) });
    await expect(
      approveWorkflow(
        {
          caller_org_id: ORG_A,
          actor_id: ACTOR,
          actor_role: "org_admin",
          directive_id: DIRECTIVE,
        },
        m.client as never,
      ),
    ).rejects.toMatchObject({ kind: "conflict" });
    expect(m.updates).toHaveLength(0);
  });

  it("throws not_found for a missing / cross-org directive (AC-6)", async () => {
    const m = makeClient({ row: null });
    await expect(
      approveWorkflow(
        {
          caller_org_id: ORG_B,
          actor_id: ACTOR,
          actor_role: "org_admin",
          directive_id: DIRECTIVE,
        },
        m.client as never,
      ),
    ).rejects.toMatchObject({ kind: "not_found" });
  });
});

describe("rejectWorkflow", () => {
  it("transitions a pending workflow to archived with the reason, audit-logged (AC-5)", async () => {
    const m = makeClient({ row: pendingRow() });
    const r = await rejectWorkflow(
      {
        caller_org_id: ORG_A,
        actor_id: ACTOR,
        actor_role: "org_admin",
        directive_id: DIRECTIVE,
        reason: "Trigger threshold is far too aggressive for this team.",
      },
      m.client as never,
    );
    expect(r.lifecycle_status).toBe("archived");
    expect(m.updates[0].payload.lifecycle_status).toBe("archived");
    expect(m.updates[0].payload.enabled).toBe(false);
    expect(m.updates[0].payload.rejection_reason).toBe(
      "Trigger threshold is far too aggressive for this team.",
    );
    expect(m.audit[0].action).toBe("workflow_rejected");
  });

  it("rejects a reason shorter than the minimum, with no write (AC-5)", async () => {
    const m = makeClient({ row: pendingRow() });
    await expect(
      rejectWorkflow(
        {
          caller_org_id: ORG_A,
          actor_id: ACTOR,
          actor_role: "org_admin",
          directive_id: DIRECTIVE,
          reason: "too short", // 9 chars < 10
        },
        m.client as never,
      ),
    ).rejects.toBeInstanceOf(DirectiveAuthoringError);
    expect(m.updates).toHaveLength(0);
    expect(m.audit).toHaveLength(0);
  });

  it("trims the reason before the length check", async () => {
    const m = makeClient({ row: pendingRow() });
    await expect(
      rejectWorkflow(
        {
          caller_org_id: ORG_A,
          actor_id: ACTOR,
          actor_role: "org_admin",
          directive_id: DIRECTIVE,
          reason: "   short    ", // trims to 5 chars
        },
        m.client as never,
      ),
    ).rejects.toBeInstanceOf(DirectiveAuthoringError);
  });

  it("WORKFLOW_REJECTION_MIN_REASON is 10", () => {
    expect(WORKFLOW_REJECTION_MIN_REASON).toBe(10);
  });
});
