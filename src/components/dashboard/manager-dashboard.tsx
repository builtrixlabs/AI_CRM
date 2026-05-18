import {
  Activity,
  CheckCircle2,
  Flame,
  ShieldCheck,
  TrendingUp,
  Users,
} from "lucide-react";
import type { CommandCenterData } from "@/lib/command-center/data";
import { BuiltrixMetricTile } from "./builtrix-metric-tile";
import {
  BuiltrixLeadsTable,
  leadRowsFromHotLeads,
} from "./builtrix-leads-table";
import { BuiltrixLaunchTiles } from "./builtrix-launch-tiles";
import { BuiltrixActivityFeed } from "./builtrix-activity-feed";

type Props = {
  data: CommandCenterData;
  firstName: string;
  greeting: string;
  /** Manager vs admin — both share the layout; only the eyebrow changes. */
  tierLabel: "manager" | "admin";
};

/**
 * MANAGER + ADMIN layout — org / workspace rollup view.
 *
 * Layout (top → bottom):
 *   1. Greeting + scope eyebrow ("Org rollup")
 *   2. 6-up KPI strip — active leads, hot pipeline, avg intent, closed MTD,
 *      agent queue status, daily volume
 *   3. Hot leads table (left 2/3) + activity feed (right 1/3)
 *   4. Pipeline state breakdown (state machine summary)
 *   5. Launch tiles (assign lead, pipeline view, today's site visits)
 */
export function ManagerDashboard({
  data,
  firstName,
  greeting,
  tierLabel,
}: Props) {
  const queueAttn = data.agentic.pending + data.agentic.rejected;
  const todayVolume = data.volume[data.volume.length - 1]?.count ?? 0;
  const stateBreakdown = data.states.slice(0, 6);
  return (
    <div className="mx-auto max-w-7xl space-y-6 px-6 py-6">
      <header className="flex items-end justify-between gap-6">
        <div>
          <div className="bcmd-page-eyebrow">
            {greeting},{" "}
            <span className="font-display font-semibold text-[var(--fg1)]">
              {firstName}
            </span>{" "}
            — here&apos;s what shifted overnight.
          </div>
          <h1 className="bcmd-page-title">
            {tierLabel === "admin" ? "Org Command" : "Team Command"}
          </h1>
        </div>
        <span
          className="bcmd-role-chip self-end"
          data-role-tier={tierLabel}
        >
          {data.scope === "org" ? "Org rollup" : "Your pipeline"}
        </span>
      </header>

      <section
        className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6"
        aria-label="Pipeline KPIs"
      >
        <BuiltrixMetricTile
          label="Active leads"
          value={data.kpis.active_leads}
          delta={data.kpis.active_leads > 0 ? "in motion" : "no movement"}
          trend={data.kpis.active_leads > 0 ? "up" : "flat"}
          Icon={Users}
        />
        <BuiltrixMetricTile
          label="Hot pipeline"
          value={data.kpis.hot_pipeline}
          delta={`${data.kpis.avg_intent || "—"} avg intent`}
          trend={data.kpis.hot_pipeline > 0 ? "up" : "flat"}
          Icon={Flame}
        />
        <BuiltrixMetricTile
          label="Closed MTD"
          value={data.kpis.closed_mtd}
          delta={data.kpis.closed_mtd > 0 ? "booked" : "first close pending"}
          trend={data.kpis.closed_mtd > 0 ? "up" : "flat"}
          Icon={CheckCircle2}
        />
        <BuiltrixMetricTile
          label="Approved today"
          value={data.agentic.sent_today}
          delta={`${data.agentic.approved} approved`}
          trend="up"
          Icon={ShieldCheck}
        />
        <BuiltrixMetricTile
          label="Queue attention"
          value={queueAttn}
          delta={
            queueAttn === 0 ? "all clear" : `${data.agentic.pending} pending`
          }
          trend={queueAttn === 0 ? "flat" : "down"}
          Icon={Activity}
        />
        <BuiltrixMetricTile
          label="Volume today"
          value={todayVolume}
          delta={`${data.volume.length} day${data.volume.length === 1 ? "" : "s"} in view`}
          trend={todayVolume > 0 ? "up" : "flat"}
          Icon={TrendingUp}
        />
      </section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <BuiltrixLeadsTable
            title="Hot leads"
            subtitle={`${data.hot_leads.length} above intent threshold`}
            rows={leadRowsFromHotLeads(data.hot_leads)}
            emptyHint="No leads above intent threshold yet. Configure scoring in Pipelines & Views."
          />
        </div>
        <BuiltrixActivityFeed
          activities={data.pulse}
          title="Org activity"
          subtitle="Last 8 touches across the org"
          limit={8}
        />
      </div>

      <section className="bcmd-card">
        <header className="bcmd-section-header">
          <div>
            <h3 className="bcmd-section-title">Pipeline distribution</h3>
            <p className="bcmd-section-subtitle">
              Leads grouped by state · refresh hourly
            </p>
          </div>
        </header>
        {stateBreakdown.length === 0 ? (
          <div className="px-6 py-10 text-center font-sans text-sm text-[var(--fg3)]">
            No leads in the pipeline yet.
          </div>
        ) : (
          <ul className="grid grid-cols-2 gap-px bg-[var(--border-subtle)] sm:grid-cols-3 lg:grid-cols-6">
            {stateBreakdown.map((s) => (
              <li
                key={s.state}
                className="bg-[var(--surface)] px-5 py-4"
              >
                <div className="bcmd-metric-label truncate">{s.state}</div>
                <div className="mt-1 font-display text-[26px] font-bold tabular-nums text-[var(--fg1)]">
                  {s.count.toLocaleString("en-IN")}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <BuiltrixLaunchTiles variant="manager" />
    </div>
  );
}
