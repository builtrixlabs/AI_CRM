import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { BASE_ROLE_PERMS } from "@/lib/auth/rbac";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  AGENT_KIND_LABELS,
  DEFAULT_SEND_POLICY,
  LOCKED_AGENT_KINDS,
  POLICY_CONFIGURABLE_AGENT_KINDS,
  type AgentMessagePolicy,
} from "@/lib/agents/send-policy";
import { PoliciesForm, type PolicyRow } from "./policies-form";

export const dynamic = "force-dynamic";

export default async function AgentPoliciesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");
  if (!user.org_id) redirect("/admin");
  if (
    !BASE_ROLE_PERMS[user.profile.base_role].has("agents:manage_policies")
  ) {
    redirect("/403");
  }

  const admin = getSupabaseAdmin();
  const { data: policyRows } = await admin
    .from("agent_message_policies")
    .select("agent_kind, mode")
    .eq("organization_id", user.org_id);

  const modeByKind = new Map<string, AgentMessagePolicy>();
  for (const r of (policyRows ?? []) as {
    agent_kind: string;
    mode: string;
  }[]) {
    modeByKind.set(
      r.agent_kind,
      r.mode === "auto_send" ? "auto_send" : "require_approval",
    );
  }

  const rows: PolicyRow[] = [
    ...POLICY_CONFIGURABLE_AGENT_KINDS.map(
      (kind): PolicyRow => ({
        agent_kind: kind,
        label: AGENT_KIND_LABELS[kind]?.label ?? kind,
        description: AGENT_KIND_LABELS[kind]?.description ?? "",
        mode: modeByKind.get(kind) ?? DEFAULT_SEND_POLICY,
        locked: false,
      }),
    ),
    ...LOCKED_AGENT_KINDS.map(
      (kind): PolicyRow => ({
        agent_kind: kind,
        label: AGENT_KIND_LABELS[kind]?.label ?? kind,
        description: AGENT_KIND_LABELS[kind]?.description ?? "",
        mode: "require_approval",
        locked: true,
      }),
    ),
  ];

  return (
    <div className="space-y-6 max-w-3xl">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Agent send policies
        </h1>
        <p className="text-sm text-neutral-600">
          Choose, per agent, whether its drafts auto-send or wait for review
          in the agent approval queue. New agent kinds default to{" "}
          <span className="font-medium">require approval</span>. Every policy
          change is audit-logged.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Message templates</CardTitle>
        </CardHeader>
        <CardContent>
          <PoliciesForm rows={rows} />
        </CardContent>
      </Card>
    </div>
  );
}
