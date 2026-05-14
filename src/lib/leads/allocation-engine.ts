// D-610 (V6 Phase 1) — Pre-sales Auto-Allocation Engine.
//
// Evaluates active allocation rules for an org against a freshly-created
// lead, allocates to the first matching rule's resolved rep, raw-updates
// the lead node's data.assigned_sales_rep_id, and audit-logs the decision.
//
// `leadSchema` is `.strict()` and rejects the richer `data` shape D-604 /
// D-417 raw-insert for externally-ingested leads, so updateNodeData (which
// re-validates) cannot run on a MIH lead — allocateLead raw-updates the
// node directly, the same external-lead exception D-604 / D-417 use.

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

// System actor for allocation-engine provenance — mirrors the
// MIH_SERVICE_ACCOUNT / WEBFORM_SERVICE_ACCOUNT convention.
const ALLOCATION_ACTOR = "00000000-0000-4000-8000-000000000003";

export type AllocationConditions = {
  source?: string;
  source_channel?: string;
  budget_band_in?: string[];
  city_in?: string[];
  bhk_in?: number[];
};

export type AllocationTargetKind =
  | "user"
  | "team_round_robin"
  | "team_first_available";

export type AllocationRule = {
  id: string;
  organization_id: string;
  name: string;
  priority: number;
  conditions: AllocationConditions;
  target_kind: AllocationTargetKind;
  target_user_id: string | null;
  target_team_id: string | null;
  active: boolean;
};

export type LeadForAllocation = {
  id: string;
  data: Record<string, unknown> | null;
};

export type AllocateResult =
  | { ok: true; outcome: "allocated"; rule_id: string; sales_rep_id: string }
  | { ok: true; outcome: "unmatched" }
  | { ok: false; reason: "lead_not_found" | "error"; message?: string };

function leadField(
  data: Record<string, unknown> | null,
  key: "source" | "source_channel",
): string | null {
  const v = data?.[key];
  return typeof v === "string" ? v : null;
}
function prefField(
  data: Record<string, unknown> | null,
  key: "budget_band" | "city",
): string | null {
  const pref = data?.preference;
  if (!pref || typeof pref !== "object") return null;
  const v = (pref as Record<string, unknown>)[key];
  return typeof v === "string" ? v : null;
}
function prefBhk(data: Record<string, unknown> | null): number | null {
  const pref = data?.preference;
  if (!pref || typeof pref !== "object") return null;
  const v = (pref as Record<string, unknown>).bhk;
  return typeof v === "number" ? v : null;
}

/**
 * A rule matches a lead when EVERY specified condition matches. An empty
 * conditions object is a catch-all (matches everything).
 */
export function matchRule(
  conditions: AllocationConditions,
  lead: LeadForAllocation,
): boolean {
  const d = lead.data;
  if (
    conditions.source !== undefined &&
    leadField(d, "source") !== conditions.source
  ) {
    return false;
  }
  if (
    conditions.source_channel !== undefined &&
    leadField(d, "source_channel") !== conditions.source_channel
  ) {
    return false;
  }
  if (conditions.budget_band_in && conditions.budget_band_in.length > 0) {
    const bb = prefField(d, "budget_band");
    if (bb === null || !conditions.budget_band_in.includes(bb)) return false;
  }
  if (conditions.city_in && conditions.city_in.length > 0) {
    const city = prefField(d, "city");
    if (city === null || !conditions.city_in.includes(city)) return false;
  }
  if (conditions.bhk_in && conditions.bhk_in.length > 0) {
    const bhk = prefBhk(d);
    if (bhk === null || !conditions.bhk_in.includes(bhk)) return false;
  }
  return true;
}

/** Team members who are not on leave, in stable id order. */
async function availableTeamMembers(
  client: SupabaseClient,
  organization_id: string,
  team_id: string,
): Promise<string[]> {
  const { data: members } = await client
    .from("team_members")
    .select("profile_id")
    .eq("organization_id", organization_id)
    .eq("team_id", team_id);
  const ids = (
    (members as Array<{ profile_id: string }> | null) ?? []
  ).map((m) => m.profile_id);
  if (ids.length === 0) return [];

  const { data: profs } = await client
    .from("profiles")
    .select("id, on_leave")
    .in("id", ids);
  const onLeave = new Map(
    (
      (profs as Array<{ id: string; on_leave: boolean | null }> | null) ?? []
    ).map((p) => [p.id, p.on_leave === true]),
  );
  return ids.filter((id) => onLeave.get(id) !== true).sort();
}

/**
 * Resolve the rule's target rep. Returns null when nobody is available —
 * the caller treats that as "rule didn't match" and falls through.
 */
export async function resolveTarget(
  rule: AllocationRule,
  client: SupabaseClient,
): Promise<string | null> {
  if (rule.target_kind === "user") {
    return rule.target_user_id ?? null;
  }
  if (!rule.target_team_id) return null;

  const members = await availableTeamMembers(
    client,
    rule.organization_id,
    rule.target_team_id,
  );
  if (members.length === 0) return null;

  if (rule.target_kind === "team_first_available") {
    return members[0];
  }

  // team_round_robin — pick the member after the cursor, advance it.
  const { data: stateRow } = await client
    .from("lead_allocation_state")
    .select("last_assigned_user_id")
    .eq("organization_id", rule.organization_id)
    .eq("team_id", rule.target_team_id)
    .maybeSingle();
  const last =
    (stateRow as { last_assigned_user_id: string | null } | null)
      ?.last_assigned_user_id ?? null;
  const lastIdx = last ? members.indexOf(last) : -1;
  const picked = members[(lastIdx + 1) % members.length];

  await client.from("lead_allocation_state").upsert(
    {
      organization_id: rule.organization_id,
      team_id: rule.target_team_id,
      last_assigned_user_id: picked,
      last_assigned_at: new Date().toISOString(),
    },
    { onConflict: "organization_id,team_id" },
  );

  return picked;
}

/**
 * Evaluate active rules (ascending priority) against the lead, allocate to
 * the first matching rule's resolved rep, raw-update the lead node, and
 * write an audit row. No match → an `lead_allocation_unmatched` audit row.
 */
export async function allocateLead(
  args: {
    lead_id: string;
    organization_id: string;
    workspace_id: string;
  },
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<AllocateResult> {
  const { lead_id, organization_id, workspace_id } = args;

  const { data: leadRow } = await client
    .from("nodes")
    .select("id, data")
    .eq("id", lead_id)
    .eq("node_type", "lead")
    .eq("organization_id", organization_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!leadRow) return { ok: false, reason: "lead_not_found" };
  const lead = leadRow as LeadForAllocation;

  const { data: ruleRows } = await client
    .from("lead_allocation_rules")
    .select(
      "id, organization_id, name, priority, conditions, target_kind, target_user_id, target_team_id, active",
    )
    .eq("organization_id", organization_id)
    .eq("active", true)
    .order("priority", { ascending: true });
  const rules = (ruleRows as AllocationRule[] | null) ?? [];

  for (const rule of rules) {
    if (!matchRule(rule.conditions ?? {}, lead)) continue;
    const target = await resolveTarget(rule, client);
    if (!target) continue; // matched but nobody available — fall through

    const mergedData = {
      ...(lead.data ?? {}),
      assigned_sales_rep_id: target,
    };
    const { error: updErr } = await client
      .from("nodes")
      .update({
        data: mergedData,
        updated_at: new Date().toISOString(),
        updated_by: ALLOCATION_ACTOR,
        updated_via: "api_sync",
      })
      .eq("id", lead_id)
      .eq("organization_id", organization_id);
    if (updErr) {
      return { ok: false, reason: "error", message: updErr.message };
    }

    await client.from("audit_log").insert({
      actor_id: ALLOCATION_ACTOR,
      actor_type: "system",
      actor_role: "allocation_engine",
      organization_id,
      workspace_id,
      table_name: "nodes",
      record_id: lead_id,
      action: "lead_allocated",
      diff: {
        rule_id: rule.id,
        target_user_id: target,
        evaluated_at: new Date().toISOString(),
      },
    });

    return {
      ok: true,
      outcome: "allocated",
      rule_id: rule.id,
      sales_rep_id: target,
    };
  }

  // No rule matched (or every matched rule resolved nobody).
  await client.from("audit_log").insert({
    actor_id: ALLOCATION_ACTOR,
    actor_type: "system",
    actor_role: "allocation_engine",
    organization_id,
    workspace_id,
    table_name: "nodes",
    record_id: lead_id,
    action: "lead_allocation_unmatched",
    diff: { evaluated_at: new Date().toISOString() },
  });

  return { ok: true, outcome: "unmatched" };
}
