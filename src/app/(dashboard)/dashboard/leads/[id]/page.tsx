import { notFound } from "next/navigation";
import { getLeadCanvas } from "@/lib/canvas/api";
import { LeadWorkspace } from "@/components/canvas/lead-workspace";
import { CustomFieldsBlock } from "@/components/canvas/custom-fields-block";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { resolveForUser } from "@/lib/auth/permissions";
import { formatRoleLabel } from "@/lib/auth/role-tier";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { BaseRole } from "@/lib/auth/types";

export const dynamic = "force-dynamic";

/**
 * v6.2.2 — lead detail uses the new 2-pane LeadWorkspace.
 *
 * Resolves owner identity + role label so the rail can render
 * "Owned by …" without an extra client roundtrip. Owner lookup is
 * best-effort: a missing assigned_sales_rep_id (or RLS denying the
 * read) silently degrades to "Unassigned" — the rail handles that
 * branch.
 */
export default async function LeadCanvasPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const data = await getLeadCanvas(id);
  if (!data) notFound();

  const user = await getCurrentUser();
  const perms = user ? resolveForUser(user) : new Set<string>();
  const canEdit = perms.has("leads:edit" as never);
  const canTransition = canEdit;
  const canPromoteToDeal = perms.has("deals:create" as never);
  // D-609 — click-to-call on the canvas, gated on calls:listen.
  const canCall = perms.has("calls:listen" as never);
  // v6.2.2 — manual email / WhatsApp send from the lead workspace rail.
  // Gated on activities:create (every rep tier + manager + admin have it).
  const canSendMessage = perms.has("activities:create" as never);
  const canScheduleVisit = perms.has("site_visits:view" as never);
  const repPhone = user?.profile.phone ?? null;

  const owner = await resolveOwner(data.lead.data, data.lead.organization_id);

  return (
    <LeadWorkspace
      lead={data.lead}
      initialActivities={data.activities}
      canEdit={canEdit}
      canTransition={canTransition}
      canCall={canCall}
      canSendMessage={canSendMessage}
      canPromoteToDeal={canPromoteToDeal}
      canScheduleVisit={canScheduleVisit}
      repPhone={repPhone}
      ownerName={owner.name}
      ownerRole={owner.role}
      customFields={<CustomFieldsBlock lead={data.lead} />}
    />
  );
}

type OwnerInfo = { name: string | null; role: string | null };

async function resolveOwner(
  data: unknown,
  organizationId: string,
): Promise<OwnerInfo> {
  const rec = (data ?? {}) as Record<string, unknown>;
  const ownerId =
    typeof rec.assigned_sales_rep_id === "string"
      ? rec.assigned_sales_rep_id
      : null;
  if (!ownerId) return { name: null, role: null };

  try {
    const admin = getSupabaseAdmin();
    const res = (await admin
      .from("profiles")
      .select("display_name, base_role")
      .eq("id", ownerId)
      .eq("organization_id", organizationId)
      .maybeSingle()) as {
      data: { display_name: string | null; base_role: BaseRole | null } | null;
      error: unknown;
    };
    if (res.error || !res.data) return { name: null, role: null };
    return {
      name: res.data.display_name,
      role: formatRoleLabel(res.data.base_role ?? null),
    };
  } catch {
    return { name: null, role: null };
  }
}
