import { Flame, ListChecks, PhoneCall, Target } from "lucide-react";
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
};

/**
 * AGENT layout — focused "today" view for sales_rep / presales_rep /
 * telemarketing_rep / customer_recovery_rep / site_visit_coordinator and
 * fallback roles.
 *
 * Layout (top → bottom):
 *   1. Greeting header
 *   2. 4-up KPI strip — My queue / Hot leads / Calls this week / Closed MTD
 *   3. Hot leads table (primary daily work surface)
 *   4. Recent activity feed (right rail, full width on mobile)
 *   5. Launch tiles (quick add lead, log call, schedule visit)
 */
export function AgentDashboard({ data, firstName, greeting }: Props) {
  const callsApproved = data.agentic.approved + data.agentic.sent_today;
  return (
    <div className="mx-auto max-w-7xl space-y-6 px-6 py-6">
      <header>
        <div className="bcmd-page-eyebrow">
          {greeting},{" "}
          <span className="font-display font-semibold text-[var(--fg1)]">
            {firstName}
          </span>{" "}
          — here&apos;s your day at a glance.
        </div>
        <h1 className="bcmd-page-title">My Day</h1>
      </header>

      <section
        className="grid grid-cols-2 gap-4 md:grid-cols-4"
        aria-label="Your numbers"
      >
        <BuiltrixMetricTile
          label="My active queue"
          value={data.kpis.active_leads}
          delta={data.kpis.active_leads > 0 ? "ready to action" : "all caught up"}
          trend={data.kpis.active_leads > 0 ? "up" : "flat"}
          Icon={ListChecks}
        />
        <BuiltrixMetricTile
          label="Hot leads (≥70)"
          value={data.kpis.hot_pipeline}
          delta={data.kpis.avg_intent > 0 ? `avg intent ${data.kpis.avg_intent}` : "no scored leads yet"}
          trend={data.kpis.hot_pipeline > 0 ? "up" : "flat"}
          Icon={Flame}
        />
        <BuiltrixMetricTile
          label="Approved by AI"
          value={callsApproved}
          delta={
            data.agentic.pending > 0
              ? `${data.agentic.pending} pending review`
              : "queue clear"
          }
          trend={callsApproved > 0 ? "up" : "flat"}
          Icon={PhoneCall}
        />
        <BuiltrixMetricTile
          label="Closed this month"
          value={data.kpis.closed_mtd}
          delta={data.kpis.closed_mtd > 0 ? "keep the streak" : "start your first"}
          trend={data.kpis.closed_mtd > 0 ? "up" : "flat"}
          Icon={Target}
        />
      </section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <BuiltrixLeadsTable
            title="Today's queue"
            subtitle={`${data.hot_leads.length} hot leads · sorted by intent`}
            rows={leadRowsFromHotLeads(data.hot_leads)}
            emptyHint="No hot leads in your queue right now. New leads will appear here automatically."
          />
        </div>
        <BuiltrixActivityFeed
          title="Recent activity"
          subtitle="Your last 8 touches"
          activities={data.pulse}
          limit={8}
          emptyHint="Your activity feed will appear here once you log your first call or message."
        />
      </div>

      <BuiltrixLaunchTiles variant="agent" />
    </div>
  );
}
