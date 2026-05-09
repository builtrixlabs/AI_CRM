import { notFound } from "next/navigation";
import { getLeadCanvas } from "@/lib/canvas/api";
import { LeadCanvas } from "@/components/canvas/lead-canvas";
import { CustomFieldsBlock } from "@/components/canvas/custom-fields-block";
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

  return (
    <LeadCanvas
      lead={data.lead}
      initialActivities={data.activities}
      canEdit={canEdit}
      canTransition={canTransition}
      customFields={<CustomFieldsBlock lead={data.lead} />}
    />
  );
}
