import { notFound } from "next/navigation";
import { getLeadCanvas } from "@/lib/canvas/api";
import { LeadCanvas } from "@/components/canvas/lead-canvas";

export const dynamic = "force-dynamic";

export default async function LeadCanvasPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const data = await getLeadCanvas(id);
  if (!data) notFound();
  return <LeadCanvas lead={data.lead} initialActivities={data.activities} />;
}
