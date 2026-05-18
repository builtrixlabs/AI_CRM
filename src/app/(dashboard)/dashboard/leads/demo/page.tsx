import { LeadWorkspace } from "@/components/canvas/lead-workspace";
import { DEMO_ACTIVITIES, DEMO_LEAD } from "@/lib/canvas/fixture";

export const dynamic = "force-dynamic";
export const metadata = { title: "Demo lead · Canvas" };

export default function LeadDemoPage() {
  return (
    <LeadWorkspace
      lead={DEMO_LEAD}
      initialActivities={DEMO_ACTIVITIES}
      demo
    />
  );
}
