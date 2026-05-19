/**
 * D-611 — compile a visual DAG into the persistence shape stored in
 * `directives.compiled_dag`. Validation is the work; the output is the
 * input with `version: 1` stamped.
 */

import { isActionKind, isTriggerKind } from "./catalog";
import type {
  CompileResult,
  CompiledDag,
  DagEdge,
  DagNode,
} from "./types";

type RawDagInput = {
  nodes: DagNode[];
  edges: DagEdge[];
};

export function compileDag(input: RawDagInput): CompileResult {
  if (!input.nodes || input.nodes.length === 0) {
    return { ok: false, error: { code: "empty_dag", message: "DAG has no nodes." } };
  }
  const triggers = input.nodes.filter((n) => n.kind === "trigger");
  if (triggers.length === 0) {
    return {
      ok: false,
      error: { code: "no_trigger", message: "A workflow needs exactly one trigger." },
    };
  }
  if (triggers.length > 1) {
    return {
      ok: false,
      error: {
        code: "multiple_triggers",
        message: "A workflow may have at most one trigger.",
      },
    };
  }
  const actions = input.nodes.filter((n) => n.kind === "action");
  if (actions.length === 0) {
    return {
      ok: false,
      error: { code: "no_actions", message: "A workflow needs at least one action." },
    };
  }
  for (const n of input.nodes) {
    if (n.kind === "trigger" && !isTriggerKind(n.trigger_kind)) {
      return {
        ok: false,
        error: {
          code: "unknown_trigger_kind",
          message: `Unknown trigger kind: ${n.trigger_kind}`,
        },
      };
    }
    if (n.kind === "action" && !isActionKind(n.action_kind)) {
      return {
        ok: false,
        error: {
          code: "unknown_action_kind",
          message: `Unknown action kind: ${n.action_kind}`,
        },
      };
    }
  }
  const nodeIds = new Set(input.nodes.map((n) => n.id));
  for (const e of input.edges ?? []) {
    if (!nodeIds.has(e.from) || !nodeIds.has(e.to)) {
      return {
        ok: false,
        error: {
          code: "edge_unknown_node",
          message: `Edge ${e.from}->${e.to} references a missing node.`,
        },
      };
    }
  }
  // No fork-merge: each `from` may appear at most once as a source.
  const outCount = new Map<string, number>();
  for (const e of input.edges ?? []) {
    outCount.set(e.from, (outCount.get(e.from) ?? 0) + 1);
  }
  for (const [from, n] of outCount) {
    if (n > 1) {
      return {
        ok: false,
        error: {
          code: "fork_not_supported",
          message: `Node ${from} has ${n} outgoing edges; V6 supports linear chains only.`,
        },
      };
    }
  }
  const dag: CompiledDag = {
    version: 1,
    nodes: input.nodes,
    edges: input.edges ?? [],
  };
  return { ok: true, dag };
}
