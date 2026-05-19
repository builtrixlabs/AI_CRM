import { describe, expect, it, vi } from "vitest";

// Sandbox MUST NOT touch real comms / inngest / db. We mock all three
// to assert the sandbox doesn't import or call them in practice.
vi.mock("@/lib/agents/follow-up/dispatch", () => ({
  dispatchApprovedDraft: vi.fn(() => {
    throw new Error("sandbox must not dispatch");
  }),
}));
vi.mock("@/lib/inngest/client", () => ({
  inngest: {
    send: vi.fn(() => {
      throw new Error("sandbox must not send events");
    }),
  },
}));
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn(() => {
    throw new Error("sandbox must not touch the DB");
  }),
}));

import { compileDag, sandboxRun } from "@/lib/workflow-builder";
import type { DagNode } from "@/lib/workflow-builder";

function makeDag(actions: DagNode[]) {
  const trigger: DagNode = {
    id: "trigger",
    kind: "trigger",
    trigger_kind: "lead.created",
    config: {},
  };
  const edges: { from: string; to: string }[] = [];
  let prev = trigger.id;
  for (const a of actions) {
    edges.push({ from: prev, to: a.id });
    prev = a.id;
  }
  const c = compileDag({ nodes: [trigger, ...actions], edges });
  if (!c.ok) throw new Error(`compile failed in fixture: ${c.error.code}`);
  return c.dag;
}

describe("sandboxRun", () => {
  it("returns a trace with one entry per visited node + mocked outputs", () => {
    const dag = makeDag([
      { id: "a1", kind: "action", action_kind: "update_lead_field", config: { field: "state", value: "qualified" } },
      { id: "a2", kind: "action", action_kind: "send_template_message", config: { template: "hello" } },
    ]);
    const r = sandboxRun(dag, { lead_id: "lead-1" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.trace).toHaveLength(3);
    expect(r.trace[0].kind).toBe("trigger");
    expect(r.trace[1].node_id).toBe("a1");
    expect((r.trace[1] as { output: { updated: boolean } }).output.updated).toBe(true);
    expect((r.trace[2] as { output: { sent: boolean } }).output.sent).toBe(true);
  });

  it("trigger node passes the sample payload through as its output", () => {
    const dag = makeDag([
      { id: "a1", kind: "action", action_kind: "create_task", config: {} },
    ]);
    const sample = { lead_id: "x", state: "qualified" };
    const r = sandboxRun(dag, sample);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.trace[0].output).toEqual(sample);
  });

  it("evaluates a condition on an edge and skips the downstream action when false", () => {
    // Action 1: send_template_message → output { sent: true }
    // Action 2 wires with a condition that requires output.state == 'qualified'
    //   (not present → false → skip)
    const dag = makeDag([
      { id: "a1", kind: "action", action_kind: "send_template_message", config: {} },
      { id: "a2", kind: "action", action_kind: "update_lead_field", config: {} },
    ]);
    // Tweak the edge between a1 and a2 to carry a condition.
    dag.edges[1].condition = { op: "equals", path: "state", value: "qualified" };
    const r = sandboxRun(dag, { lead_id: "x" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.trace).toHaveLength(3);
    const a2 = r.trace[2] as { skipped?: { reason: string } };
    expect(a2.skipped?.reason).toBe("condition_false");
  });

  it("evaluates a 'present' condition (truthy on non-null/undefined)", () => {
    const dag = makeDag([
      { id: "a1", kind: "action", action_kind: "send_brochure", config: { brochure_id: "b1" } },
      { id: "a2", kind: "action", action_kind: "create_task", config: {} },
    ]);
    dag.edges[1].condition = { op: "present", path: "brochure_id" };
    const r = sandboxRun(dag, { lead_id: "x" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // a1 output carries { brochure_id }, so a2 runs.
    expect(r.trace).toHaveLength(3);
    expect((r.trace[2] as { skipped?: unknown }).skipped).toBeUndefined();
  });

  it("does not import or call dispatch / inngest / db (mocks throw if invoked)", () => {
    const dag = makeDag([
      { id: "a1", kind: "action", action_kind: "send_template_message", config: {} },
    ]);
    expect(() => sandboxRun(dag, { lead_id: "x" })).not.toThrow();
  });

  it("returns ok=false when the DAG has no trigger", () => {
    // Construct a malformed DAG bypassing compileDag.
    const r = sandboxRun(
      {
        version: 1,
        nodes: [
          { id: "a1", kind: "action", action_kind: "send_template_message", config: {} },
        ],
        edges: [],
      },
      {},
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("no_trigger");
  });
});
