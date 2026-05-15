"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { BASE_ROLE_PERMS } from "@/lib/auth/rbac";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  isConfigurableAgentKind,
  type AgentMessagePolicy,
} from "@/lib/agents/send-policy";

export type SetAgentPolicyResult =
  | { ok: true; mode: AgentMessagePolicy }
  | {
      ok: false;
      error: "permission" | "validation" | "internal";
      message?: string;
    };

async function gate() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");
  if (!user.org_id) return null;
  if (
    !BASE_ROLE_PERMS[user.profile.base_role].has("agents:manage_policies")
  ) {
    return null;
  }
  return user;
}

/**
 * D-614 — set the send policy for one agent kind in the caller's org.
 * Gated on `agents:manage_policies`. Only `POLICY_CONFIGURABLE_AGENT_KINDS`
 * may be set — locked kinds (site_visit_booking) and unknown kinds are
 * rejected as validation errors. Upserts on the (org, agent_kind) PK and
 * writes one audit_log row.
 */
export async function setAgentPolicyAction(
  agent_kind: string,
  mode: string,
): Promise<SetAgentPolicyResult> {
  const user = await gate();
  if (!user || !user.org_id) return { ok: false, error: "permission" };

  if (!isConfigurableAgentKind(agent_kind)) {
    return {
      ok: false,
      error: "validation",
      message: "agent kind is not configurable",
    };
  }
  if (mode !== "auto_send" && mode !== "require_approval") {
    return { ok: false, error: "validation", message: "invalid mode" };
  }

  const admin = getSupabaseAdmin();
  const { error: upErr } = await admin
    .from("agent_message_policies")
    .upsert(
      {
        organization_id: user.org_id,
        agent_kind,
        mode,
        updated_at: new Date().toISOString(),
        updated_by: user.user.id,
      },
      { onConflict: "organization_id,agent_kind" },
    );
  if (upErr) return { ok: false, error: "internal", message: upErr.message };

  await admin.from("audit_log").insert({
    actor_id: user.user.id,
    actor_type: "user",
    actor_role: "org_admin",
    organization_id: user.org_id,
    workspace_id: null,
    table_name: "agent_message_policies",
    record_id: null,
    action: "agent_message_policy_set",
    diff: { agent_kind, mode },
  });

  revalidatePath("/admin/agents/policies");
  return { ok: true, mode };
}
