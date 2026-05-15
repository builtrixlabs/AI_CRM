import { notFound } from "next/navigation";
import { getLeadCanvas, getLeadCanvasV2 } from "@/lib/canvas/api";
import { LeadCanvas } from "@/components/canvas/lead-canvas";
import { CustomFieldsBlock } from "@/components/canvas/custom-fields-block";
import { PromoteToDealButton } from "@/components/canvas/promote-to-deal-button";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { resolveForUser } from "@/lib/auth/permissions";
import { getFeatureFlag } from "@/lib/orgs/feature-flags";
import { LeadCanvasV2 } from "./lead-canvas-v2";

export const dynamic = "force-dynamic";

export default async function LeadCanvasPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const user = await getCurrentUser();
  const v2_enabled = await getFeatureFlag(user?.org_id ?? null, "lead_canvas_v2");

  // v6.2.1 — flag-gated split-pane canvas. Falls through to the legacy
  // canvas when the flag is off so existing orgs keep their familiar UI
  // until super_admin flips them over.
  if (v2_enabled) {
    const data = await getLeadCanvasV2(id);
    if (!data) notFound();
    const perms = user ? resolveForUser(user) : new Set<string>();
    const assignedRepId =
      typeof (data.lead.data as { assigned_sales_rep_id?: unknown })
        .assigned_sales_rep_id === "string"
        ? ((data.lead.data as { assigned_sales_rep_id?: string })
            .assigned_sales_rep_id ?? null)
        : null;
    const is_owner = !!user && !!assignedRepId && assignedRepId === user.user.id;
    const can_approve_any_in_org =
      perms.has("agents:approve_T2" as never) ||
      perms.has("agents:view_activity" as never);
    const can_approve_own = perms.has("agents:approve_own_leads" as never);

    return (
      <LeadCanvasV2
        data={data}
        canApproveDraft={
          can_approve_any_in_org || (can_approve_own && is_owner)
        }
        canApproveAnyInOrg={can_approve_any_in_org}
        isOwner={is_owner}
        canEdit={perms.has("leads:edit" as never)}
        canCall={perms.has("calls:listen" as never)}
        canPromoteToDeal={perms.has("deals:create" as never)}
        repPhone={user?.profile.phone ?? null}
      />
    );
  }

  const data = await getLeadCanvas(id);
  if (!data) notFound();

  const perms = user ? resolveForUser(user) : new Set<string>();
  const canEdit = perms.has("leads:edit" as never);
  const canTransition = canEdit;
  const canPromoteToDeal = perms.has("deals:create" as never);
  // D-609 — click-to-call on the canvas, gated on calls:listen.
  const canCall = perms.has("calls:listen" as never);
  const repPhone = user?.profile.phone ?? null;

  return (
    <div className="space-y-3">
      {canPromoteToDeal && (
        <div className="flex justify-end">
          <PromoteToDealButton leadId={data.lead.id} />
        </div>
      )}
      <LeadCanvas
        lead={data.lead}
        initialActivities={data.activities}
        canEdit={canEdit}
        canTransition={canTransition}
        canCall={canCall}
        repPhone={repPhone}
        customFields={<CustomFieldsBlock lead={data.lead} />}
      />
    </div>
  );
}
