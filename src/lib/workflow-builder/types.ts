/**
 * D-611 — visual workflow builder types.
 *
 * A workflow DAG (the value stored in `directives.compiled_dag`):
 *   - nodes: a flat array — exactly one trigger node + one or more
 *            action nodes.
 *   - edges: ordered list of (from_node_id → to_node_id) connections;
 *            each edge optionally carries a condition expression
 *            evaluated against the output of `from_node_id`.
 *
 * No fork-merge in V6: every node has at most one outgoing edge
 * (linear chain + optional if/else).
 */

export type TriggerKind =
  | "whatsapp.inbound"
  | "email.inbound"
  | "lead.created"
  | "call.next_best_action"
  | "lead.state_changed"
  | "manual.button_click"
  | "schedule";

export type ActionKind =
  | "send_template_message"
  | "update_lead_field"
  | "assign_to_user"
  | "create_task"
  | "send_brochure"
  | "book_site_visit"
  | "call_ai_gateway";

export type DagNode =
  | {
      id: string;
      kind: "trigger";
      trigger_kind: TriggerKind;
      config: Record<string, unknown>;
      /** UI hint — React Flow position (no semantics for V6 form composer). */
      position?: { x: number; y: number };
    }
  | {
      id: string;
      kind: "action";
      action_kind: ActionKind;
      config: Record<string, unknown>;
      position?: { x: number; y: number };
    };

export type DagEdge = {
  from: string;
  to: string;
  /** Optional condition expression evaluated against `from`'s output.
   *  Two ops only in V6: `equals` and `present`.
   *  - { op: 'equals', path: 'state', value: 'qualified' }
   *  - { op: 'present', path: 'brochure_id' }
   */
  condition?:
    | { op: "equals"; path: string; value: unknown }
    | { op: "present"; path: string };
};

export type CompiledDag = {
  version: 1;
  nodes: DagNode[];
  edges: DagEdge[];
};

export type TestPayloadEntry = {
  name: string;
  payload: Record<string, unknown>;
  last_run_at: string;
  last_run_ok: boolean;
};

export type SandboxNodeTrace =
  | {
      node_id: string;
      kind: "trigger";
      trigger_kind: TriggerKind;
      input: Record<string, unknown>;
      output: Record<string, unknown>;
    }
  | {
      node_id: string;
      kind: "action";
      action_kind: ActionKind;
      input: Record<string, unknown>;
      output: Record<string, unknown>;
      skipped?: { reason: "condition_false"; condition: DagEdge["condition"] };
    };

export type SandboxResult = {
  ok: true;
  trace: SandboxNodeTrace[];
} | {
  ok: false;
  error: string;
};

export type CompileError = {
  code:
    | "empty_dag"
    | "no_trigger"
    | "multiple_triggers"
    | "unknown_trigger_kind"
    | "unknown_action_kind"
    | "edge_unknown_node"
    | "fork_not_supported"
    | "no_actions";
  message: string;
};

export type CompileResult =
  | { ok: true; dag: CompiledDag }
  | { ok: false; error: CompileError };
