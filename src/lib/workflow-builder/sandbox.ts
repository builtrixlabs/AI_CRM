/**
 * D-611 — sandbox runner. Walks a compiled DAG node-by-node against a
 * sample payload and produces a per-node trace. NO real side effects:
 * no DB writes, no Inngest emits, no template sends, no AI gateway
 * calls. All action outputs are mocked fixtures.
 */

import { TRIGGER_LABEL, ACTION_LABEL } from "./catalog";
import type {
  CompiledDag,
  DagEdge,
  DagNode,
  SandboxNodeTrace,
  SandboxResult,
} from "./types";

function evaluateCondition(
  condition: DagEdge["condition"],
  upstreamOutput: Record<string, unknown>,
): boolean {
  if (!condition) return true;
  const value = getByPath(upstreamOutput, condition.path);
  if (condition.op === "equals") {
    return value === condition.value;
  }
  if (condition.op === "present") {
    return value !== undefined && value !== null;
  }
  return false;
}

function getByPath(obj: Record<string, unknown>, path: string): unknown {
  if (!path) return undefined;
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur === null || cur === undefined || typeof cur !== "object") {
      return undefined;
    }
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

function mockActionOutput(
  action_kind: string,
  input: Record<string, unknown>,
): Record<string, unknown> {
  // Deterministic fixtures keyed by kind — tests assert these exact
  // shapes so the operator can rely on the sandbox showing realistic
  // (but synthetic) output.
  switch (action_kind) {
    case "send_template_message":
      return { sent: true, message_id: "mock-msg-001", channel: input.channel ?? "whatsapp" };
    case "update_lead_field":
      return {
        updated: true,
        lead_id: input.lead_id ?? "mock-lead",
        field: input.field ?? "(unspecified)",
        value: input.value,
      };
    case "assign_to_user":
      return { assigned: true, user_id: input.user_id ?? "mock-user" };
    case "create_task":
      return { task_id: "mock-task-001", due_at: input.due_at ?? null };
    case "send_brochure":
      return {
        sent: true,
        brochure_id: input.brochure_id ?? "mock-brochure",
        signed_url: "https://sandbox.invalid/mock-brochure.pdf",
      };
    case "book_site_visit":
      return { booked: true, site_visit_id: "mock-sv-001" };
    case "call_ai_gateway":
      return { completion: "(mock AI response)", model: input.model ?? "claude-sonnet" };
    default:
      return { ok: true };
  }
}

export function sandboxRun(
  dag: CompiledDag,
  samplePayload: Record<string, unknown>,
): SandboxResult {
  const trigger = dag.nodes.find((n): n is Extract<DagNode, { kind: "trigger" }> => n.kind === "trigger");
  if (!trigger) {
    return { ok: false, error: "no_trigger" };
  }

  const trace: SandboxNodeTrace[] = [];
  // The trigger's output is the supplied sample payload; its label is
  // human-readable but doesn't affect semantics.
  const triggerOutput = { ...samplePayload };
  trace.push({
    node_id: trigger.id,
    kind: "trigger",
    trigger_kind: trigger.trigger_kind,
    input: samplePayload,
    output: triggerOutput,
  });

  const nodeById = new Map(dag.nodes.map((n) => [n.id, n]));
  const outgoing = new Map<string, DagEdge>();
  for (const e of dag.edges) {
    outgoing.set(e.from, e);
  }

  let cursor: string | undefined = trigger.id;
  let lastOutput: Record<string, unknown> = triggerOutput;
  const visited = new Set<string>([trigger.id]);

  while (cursor !== undefined) {
    const edge = outgoing.get(cursor);
    if (!edge) break;
    const next = nodeById.get(edge.to);
    if (!next || next.kind !== "action") break;
    if (visited.has(next.id)) break; // cycle guard

    const condOk = evaluateCondition(edge.condition, lastOutput);
    if (!condOk) {
      trace.push({
        node_id: next.id,
        kind: "action",
        action_kind: next.action_kind,
        input: lastOutput,
        output: {},
        skipped: { reason: "condition_false", condition: edge.condition },
      });
      // Skipped nodes still terminate the chain (V6 has no else branches).
      break;
    }

    const actionInput = { ...lastOutput, ...next.config };
    const actionOutput = mockActionOutput(next.action_kind, actionInput);
    trace.push({
      node_id: next.id,
      kind: "action",
      action_kind: next.action_kind,
      input: actionInput,
      output: actionOutput,
    });

    visited.add(next.id);
    cursor = next.id;
    lastOutput = actionOutput;
  }

  return { ok: true, trace };
}

export { TRIGGER_LABEL as TRIGGER_LABELS, ACTION_LABEL as ACTION_LABELS };
