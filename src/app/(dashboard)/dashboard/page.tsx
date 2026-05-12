import { KpiTiles } from "@/components/command-center/kpi-tiles";
import { PulseFeed } from "@/components/command-center/pulse-feed";
import { LeadHeatmap } from "@/components/command-center/lead-heatmap";
import { AgenticState } from "@/components/command-center/agentic-state";
import { HotLeadsStrip } from "@/components/command-center/hot-leads";
import { StateMachineCanvas } from "@/components/command-center/state-machine-canvas";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";

export const dynamic = "force-dynamic";

export default async function CommandCenterHome() {
  const user = await getCurrentUser();
  const greeting = greetingForHour(new Date().getHours());
  const firstName = user?.profile?.display_name?.split(" ")[0] ?? "operator";

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-6 py-6">
      <header className="flex items-end justify-between gap-6">
        <div>
          <div className="cc-eyebrow cc-eyebrow-soft">Command Center · Chennai</div>
          <h1 className="brand-display mt-2 text-foreground">
            {greeting},{" "}
            <span
              className="bg-clip-text text-transparent"
              style={{ backgroundImage: "var(--cc-gradient-violet-teal)" }}
            >
              {firstName}
            </span>
          </h1>
        </div>
        <div className="cc-pill cc-pill-mint shrink-0">
          All Listeners online · v3.2 · Intent-Net
        </div>
      </header>

      <KpiTiles />

      <div className="grid min-h-[480px] grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1fr)]">
        <PulseFeed />
        <LeadHeatmap />
        <AgenticState />
      </div>

      <StateMachineCanvas />

      <HotLeadsStrip />
    </div>
  );
}

function greetingForHour(h: number): string {
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}
