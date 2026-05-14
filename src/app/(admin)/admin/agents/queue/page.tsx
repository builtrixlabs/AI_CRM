import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { BASE_ROLE_PERMS } from "@/lib/auth/rbac";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  QueueItem,
  type QueueAttachment,
  type QueueItemRow,
} from "./queue-item";

export const dynamic = "force-dynamic";

type RawQueueRow = {
  id: string;
  lead_id: string;
  channel: string;
  draft_body: string;
  agent_kind: string;
  created_at: string;
  // D-600 — brochure_send rows carry brochure refs + an agent-level error.
  attachments: unknown;
  error: string | null;
};

type LeadLabelRow = { id: string; label: string };

export default async function AgentQueuePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");
  if (!user.org_id) redirect("/admin");
  if (!BASE_ROLE_PERMS[user.profile.base_role].has("agents:view_activity")) {
    redirect("/403");
  }

  const admin = getSupabaseAdmin();
  const { data: rows } = await admin
    .from("agent_approval_queue")
    .select(
      "id, lead_id, channel, draft_body, agent_kind, created_at, attachments, error",
    )
    .eq("organization_id", user.org_id)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(100);

  const queueRows = (rows ?? []) as RawQueueRow[];
  const leadIds = Array.from(new Set(queueRows.map((r) => r.lead_id)));

  let labelById = new Map<string, string>();
  if (leadIds.length > 0) {
    const { data: leads } = await admin
      .from("nodes")
      .select("id, label")
      .in("id", leadIds);
    if (leads) {
      labelById = new Map(
        (leads as LeadLabelRow[]).map((l) => [l.id, l.label])
      );
    }
  }

  const items: QueueItemRow[] = queueRows.map((r) => ({
    id: r.id,
    lead_id: r.lead_id,
    lead_label: labelById.get(r.lead_id) ?? "(lead)",
    channel:
      r.channel === "whatsapp"
        ? "whatsapp"
        : r.channel === "sms"
          ? "sms"
          : "email",
    draft_body: r.draft_body,
    agent_kind: r.agent_kind,
    created_at: r.created_at,
    attachments: Array.isArray(r.attachments)
      ? (r.attachments as QueueAttachment[]).filter(
          (a) =>
            a &&
            typeof a.brochure_id === "string" &&
            typeof a.title === "string",
        )
      : [],
    error: r.error ?? null,
  }));

  return (
    <div className="space-y-6 max-w-3xl">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Agent approval queue
        </h1>
        <p className="text-sm text-neutral-600">
          Drafts produced by T2 agents waiting for org-admin review.
          Approve, edit-and-approve, or reject with reason. All decisions
          are audit-logged.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Pending ({items.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {items.length === 0 ? (
            <p className="text-sm text-neutral-500">
              No pending drafts. The follow-up agent runs every 6h; come
              back later.
            </p>
          ) : (
            items.map((it) => <QueueItem key={it.id} item={it} />)
          )}
        </CardContent>
      </Card>
    </div>
  );
}
