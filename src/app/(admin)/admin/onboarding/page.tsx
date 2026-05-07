import { redirect } from "next/navigation";
import { getOnboardingState, STEP_IDS } from "@/lib/admin";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { Wizard } from "./wizard";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");
  if (!user.org_id) redirect("/dashboard");

  const state = await getOnboardingState(user.org_id);

  if (state.completed) {
    redirect("/admin?onboarded=1");
  }

  // Pull existing org data for step 1's pre-fill.
  return (
    <Wizard
      currentStep={state.current_step === "completed" ? "org_details" : state.current_step}
      completedSteps={state.completed_steps}
      stepNumber={
        (STEP_IDS as readonly string[]).indexOf(state.current_step) + 1
      }
      leadSources={state.lead_sources}
      pipelineStages={state.pipeline_stages}
    />
  );
}
