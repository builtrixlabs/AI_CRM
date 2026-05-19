import { describe, expect, it } from "vitest";
import { compileDag } from "@/lib/workflow-builder";
import type { DagNode } from "@/lib/workflow-builder";

const trigger = (): DagNode => ({
  id: "t1",
  kind: "trigger",
  trigger_kind: "lead.created",
  config: {},
});

const action = (id: string): DagNode => ({
  id,
  kind: "action",
  action_kind: "send_template_message",
  config: {},
});

describe("compileDag", () => {
  it("rejects an empty DAG", () => {
    const r = compileDag({ nodes: [], edges: [] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("empty_dag");
  });

  it("rejects a DAG with no trigger", () => {
    const r = compileDag({ nodes: [action("a1")], edges: [] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("no_trigger");
  });

  it("rejects a DAG with multiple triggers", () => {
    const t1 = trigger();
    const t2: DagNode = { ...trigger(), id: "t2" };
    const r = compileDag({ nodes: [t1, t2, action("a1")], edges: [] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("multiple_triggers");
  });

  it("rejects a DAG with no actions (trigger only)", () => {
    const r = compileDag({ nodes: [trigger()], edges: [] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("no_actions");
  });

  it("rejects an unknown trigger kind", () => {
    const r = compileDag({
      nodes: [
        // @ts-expect-error
        { id: "t1", kind: "trigger", trigger_kind: "bogus", config: {} },
        action("a1"),
      ],
      edges: [{ from: "t1", to: "a1" }],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("unknown_trigger_kind");
  });

  it("rejects an unknown action kind", () => {
    const r = compileDag({
      nodes: [
        trigger(),
        // @ts-expect-error
        { id: "a1", kind: "action", action_kind: "bogus", config: {} },
      ],
      edges: [{ from: "t1", to: "a1" }],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("unknown_action_kind");
  });

  it("rejects an edge that references a missing node", () => {
    const r = compileDag({
      nodes: [trigger(), action("a1")],
      edges: [{ from: "t1", to: "missing" }],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("edge_unknown_node");
  });

  it("rejects fork (two outgoing edges from same node)", () => {
    const r = compileDag({
      nodes: [trigger(), action("a1"), action("a2")],
      edges: [
        { from: "t1", to: "a1" },
        { from: "t1", to: "a2" },
      ],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("fork_not_supported");
  });

  it("accepts a valid linear DAG and stamps version=1", () => {
    const r = compileDag({
      nodes: [trigger(), action("a1"), action("a2")],
      edges: [
        { from: "t1", to: "a1" },
        { from: "a1", to: "a2" },
      ],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.dag.version).toBe(1);
      expect(r.dag.nodes).toHaveLength(3);
      expect(r.dag.edges).toHaveLength(2);
    }
  });
});
