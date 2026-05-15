import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { getCommandCenterData } from "@/lib/command-center/data";
import { KpiTiles } from "@/components/command-center/kpi-tiles";
import { PulseFeed } from "@/components/command-center/pulse-feed";
import { LeadHeatmap } from "@/components/command-center/lead-heatmap";
import { AgenticState } from "@/components/command-center/agentic-state";
import { HotLeadsStrip } from "@/components/command-center/hot-leads";
import { StateMachineCanvas } from "@/components/command-center/state-machine-canvas";

export const dynamic = "force-dynamic";

function greetingForHour(h: number): string {
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

/**
 * D-605 Command Center home — real org-scoped, role-scoped data.
 * Replaces the Phase-0 hardcoded mockup.
 */
export default async function CommandCenterHome() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");
  if (!user.org_id) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-12">
        <p className="text-sm text-muted-foreground">
          Your account is not yet linked to an organization. Contact your
          admin.
        </p>
      </div>
    );
  }

  const data = await getCommandCenterData({
    user_id: user.user.id,
    organization_id: user.org_id,
    base_role: user.profile.base_role,
  });

  const greeting = greetingForHour(new Date().getHours());
  const firstName = user.profile.display_name?.split(" ")[0] ?? "operator";

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-6 py-6">
      <header className="flex items-end justify-between gap-6">
        <div>
          <div className="cc-eyebrow cc-eyebrow-soft">
            Command Center ·{" "}
            {data.scope === "org" ? "Org rollup" : "Your pipeline"}
          </div>
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
      </header>

      {!data.has_any_data ? (
        <div
          className="cc-card px-6 py-12 text-center"
          data-testid="cc-empty-state"
        >
          <h2 className="text-lg font-semibold">No leads yet</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Connect the Marketing Intelligence Hub or use the universal
            webform endpoint to start ingesting leads.
          </p>
          <Link
            href="/admin/integrations"
            className="mt-4 inline-block text-sm underline"
          >
            Configure integrations →
          </Link>
        </div>
      ) : (
        <>
          <KpiTiles kpis={data.kpis} />

          <div className="grid min-h-[480px] grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1fr)]">
            <PulseFeed initialActivities={data.pulse} orgId={user.org_id} />
            <LeadHeatmap volume={data.volume} />
            <AgenticState agentic={data.agentic} />
          </div>

          <StateMachineCanvas states={data.states} />

          <HotLeadsStrip hotLeads={data.hot_leads} />
        </>
      )}
    </div>
  );
}
