import { z } from "zod";
import { updateNodeData } from "@/lib/nodes/api";
import { findAgent } from "./registry";
import { registerAgentHandler, type AgentHandler } from "./runtime";
import type { AgentInvocation, AgentResult } from "./types";
import type { AgentTier } from "@/lib/ai/types";

export const ENRICH_LEAD_ACTION = "enrich_lead";

export type EnrichLeadPayload = {
  lead_id: string;
};

const enrichLeadOutputSchema = z.object({
  score: z.number().int().min(0).max(100),
  rationale: z.string().max(240),
});

const SYSTEM_PROMPT = `You are the Lead Enrichment Agent (T1). Score a new lead's intent on a 0-100 scale. Output JSON only: {"score": int, "rationale": string ≤ 240 chars}. No PII echoing.`;

function buildPrompt(input: {
  label: string;
  source: string;
  notes?: string | null;
  state: string;
}): string {
  return [
    `state: ${input.state}`,
    `source: ${input.source}`,
    input.notes ? `notes: ${input.notes}` : null,
    `label: ${input.label}`,
    "",
    "Score now. JSON only.",
  ]
    .filter(Boolean)
    .join("\n");
}

function tryParseScore(
  text: string,
): { ok: true; score: number; rationale: string } | { ok: false; reason: string } {
  // Strip Markdown fences if the model wrapped output despite the
  // prompt's "JSON only" instruction.
  const stripped = text.replace(/^```(?:json)?\n?/i, "").replace(/```\s*$/, "").trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch (err) {
    return {
      ok: false,
      reason: `JSON parse failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  const validated = enrichLeadOutputSchema.safeParse(parsed);
  if (!validated.success) {
    return {
      ok: false,
      reason: `Schema mismatch: ${validated.error.issues
        .map((i) => `${i.path.join(".")}:${i.message}`)
        .join("; ")}`,
    };
  }
  return {
    ok: true,
    score: validated.data.score,
    rationale: validated.data.rationale,
  };
}

const handler: AgentHandler = async (inv, deps) => {
  const payload = inv.payload as EnrichLeadPayload;
  if (!payload || typeof payload.lead_id !== "string") {
    return {
      ok: false,
      error: "validation",
      message: "enrich_lead payload must include lead_id",
    };
  }

  const gateway = deps.gateway;
  if (!gateway) {
    return {
      ok: false,
      error: "validation",
      message: "agent runtime: no gateway provided",
    };
  }
  const client = deps.client;
  if (!client) {
    return {
      ok: false,
      error: "validation",
      message: "agent runtime: no client provided",
    };
  }

  // Read the lead — must belong to inv.organization_id (defense-in-
  // depth on top of service-role).
  const { data: leadRow, error: readErr } = await client
    .from("nodes")
    .select("id, label, state, data, organization_id, workspace_id, node_type, deleted_at")
    .eq("id", payload.lead_id)
    .eq("node_type", "lead")
    .eq("organization_id", inv.organization_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (readErr) {
    return {
      ok: false,
      error: "unknown",
      message: `lead lookup failed: ${readErr.message}`,
    };
  }
  if (!leadRow) {
    return {
      ok: false,
      error: "validation",
      message: `lead ${payload.lead_id} not found in org ${inv.organization_id}`,
    };
  }

  const data = (leadRow.data ?? {}) as Record<string, unknown>;

  // Idempotent: if intent_score is already set, skip the gateway call.
  if (typeof data.intent_score === "number") {
    return {
      ok: true,
      tier: inv.attempted_tier,
      audit_log_id: null,
      output: { skipped: true, reason: "intent_score already set" },
    };
  }

  const promptInput = {
    label: typeof leadRow.label === "string" ? leadRow.label : "",
    source: typeof data.source === "string" ? data.source : "other",
    notes: typeof data.notes === "string" ? data.notes : null,
    state: typeof leadRow.state === "string" ? leadRow.state : "new",
  };
  const prompt = buildPrompt(promptInput);

  const completionResult = await gateway.complete(
    {
      prompt,
      system: SYSTEM_PROMPT,
      organization_id: inv.organization_id,
      agent_id: inv.agent_id,
      agent_tier: inv.attempted_tier,
      max_tokens: 256,
    },
    deps.client ? { client: deps.client } : {},
  );

  if (!completionResult.ok) {
    // Audit: agent_action_failed
    await client.from("audit_log").insert({
      actor_id: inv.agent_id,
      actor_type: "agent",
      actor_role: "service_account",
      organization_id: inv.organization_id,
      workspace_id: inv.workspace_id,
      table_name: "nodes",
      record_id: payload.lead_id,
      action: "agent_action_failed",
      agent_tier: inv.attempted_tier,
      prompt_version: findAgent("lead_enrichment")?.prompt_version ?? "v1",
      reasoning: `gateway ${completionResult.error}: ${completionResult.message}`,
    });
    return {
      ok: false,
      error: "gateway",
      message: completionResult.message,
    };
  }

  const parsed = tryParseScore(completionResult.text);
  if (!parsed.ok) {
    await client.from("audit_log").insert({
      actor_id: inv.agent_id,
      actor_type: "agent",
      actor_role: "service_account",
      organization_id: inv.organization_id,
      workspace_id: inv.workspace_id,
      table_name: "nodes",
      record_id: payload.lead_id,
      action: "agent_action_failed",
      agent_tier: inv.attempted_tier,
      prompt_version: findAgent("lead_enrichment")?.prompt_version ?? "v1",
      reasoning: `parse: ${parsed.reason}`,
      nl_input: completionResult.text.slice(0, 1000),
    });
    return {
      ok: false,
      error: "validation",
      message: parsed.reason,
    };
  }

  // Persist the score via D-002's helper. updateNodeData writes its
  // own audit row (action='node_update'); we then write OUR agent
  // audit row alongside.
  await updateNodeData(
    {
      id: payload.lead_id,
      partial: { intent_score: parsed.score },
      updated_by: inv.agent_id,
      updated_via: "ai_extraction",
    },
    client,
  );

  const auditInsert = await client
    .from("audit_log")
    .insert({
      actor_id: inv.agent_id,
      actor_type: "agent",
      actor_role: "service_account",
      organization_id: inv.organization_id,
      workspace_id: inv.workspace_id,
      table_name: "nodes",
      record_id: payload.lead_id,
      action: "agent_action",
      agent_tier: inv.attempted_tier,
      prompt_version: findAgent("lead_enrichment")?.prompt_version ?? "v1",
      reasoning: parsed.rationale,
      compiled_artifact: { score: parsed.score, rationale: parsed.rationale },
    })
    .select("id")
    .single();
  const audit_log_id =
    !auditInsert.error && auditInsert.data
      ? (auditInsert.data as { id: string }).id
      : null;

  return {
    ok: true,
    tier: inv.attempted_tier,
    audit_log_id,
    output: { score: parsed.score, rationale: parsed.rationale },
  };
};

/** Public entry point + handler registration. */
export const enrichLeadHandler: AgentHandler = handler;

registerAgentHandler("lead_enrichment", ENRICH_LEAD_ACTION, handler);

/** Convenience helper used by Inngest function + integration tests. */
export async function enrichLead(args: {
  agent_id: string;
  lead_id: string;
  organization_id: string;
  workspace_id: string;
  attempted_tier?: AgentTier;
}, deps: import("./runtime").AgentDeps): Promise<AgentResult> {
  // Lazy import to avoid a circular module load between
  // runtime.ts ↔ lead-enrichment.ts at top-level.
  const { runAgent } = await import("./runtime");
  const inv: AgentInvocation = {
    agent_id: args.agent_id,
    organization_id: args.organization_id,
    workspace_id: args.workspace_id,
    action: ENRICH_LEAD_ACTION,
    attempted_tier: args.attempted_tier ?? "T1",
    payload: { lead_id: args.lead_id } satisfies EnrichLeadPayload,
  };
  return runAgent(inv, deps);
}
