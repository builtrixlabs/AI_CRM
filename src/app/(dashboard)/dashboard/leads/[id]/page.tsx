import { notFound } from "next/navigation";
import { getLeadCanvas } from "@/lib/canvas/api";
import { LeadCanvas } from "@/components/canvas/lead-canvas";
import { CustomFieldsBlock } from "@/components/canvas/custom-fields-block";
import { PromoteToDealButton } from "@/components/canvas/promote-to-deal-button";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { resolveForUser } from "@/lib/auth/permissions";

export const dynamic = "force-dynamic";

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
