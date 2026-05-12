import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { STEP_IDS, type StepId } from "@/lib/admin/types";

type Props = {
  completed: boolean;
  currentStep: StepId | "completed";
  resumeHref?: string;
};

function humanize(step: string): string {
  return step.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * D-501 port of PSCRM's onboarding banner — rendered above /admin when
 * the org's onboarding wizard is incomplete. Hides itself once completed.
 *
 * Takes the cockpit-shaped `{ completed, current_step }` from
 * `getCockpitData()` so the existing /admin/page.tsx wires it without
 * changing query shape.
 */
export function OnboardingBanner({
  completed,
  currentStep,
  resumeHref = "/admin/onboarding",
}: Props) {
  if (completed || currentStep === "completed") return null;

  const idx = (STEP_IDS as readonly string[]).indexOf(currentStep);
  const completedCount = idx < 0 ? 0 : idx;
  const total = STEP_IDS.length;
  const pct = Math.min(100, Math.round((completedCount / total) * 100));

  return (
    <Card
      className="border bg-secondary/40"
      style={{ borderColor: "var(--amethyst-300)" }}
    >
      <CardContent className="flex flex-col gap-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <Sparkles
            className="mt-0.5 h-5 w-5 flex-none"
            style={{ color: "var(--amethyst-700)" }}
          />
          <div className="space-y-1">
            <div className="text-sm font-semibold">
              Finish setting up your organization
            </div>
            <div className="text-xs text-muted-foreground">
              Step {completedCount + 1} of {total} —{" "}
              <span className="font-medium">{humanize(currentStep)}</span>
              <span className="ml-2 tabular-nums">({pct}%)</span>
            </div>
            <div
              className="mt-2 h-1.5 w-48 overflow-hidden rounded-full"
              style={{ background: "var(--amethyst-100)" }}
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${pct}%`,
                  background: "var(--amethyst-600)",
                }}
              />
            </div>
          </div>
        </div>
        <Button asChild size="sm">
          <Link href={resumeHref}>
            Resume setup
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
