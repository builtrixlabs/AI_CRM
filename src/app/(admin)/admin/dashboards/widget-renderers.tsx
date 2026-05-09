import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { fetchWidgetData } from "@/lib/dashboards/widgets";

const LEAD_STATE_LABEL: Record<string, string> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  lost: "Lost",
  on_hold: "On hold",
  junk: "Junk",
};
import {
  WIDGET_LABEL,
  type WidgetSpec,
} from "@/lib/dashboards/types";

/**
 * Server Component widget renderer. Each widget fetches its own data
 * (per-widget cache later). Returns a Card.
 */
export async function WidgetCard({
  spec,
  organization_id,
}: {
  spec: WidgetSpec;
  organization_id: string;
}) {
  const title = spec.title ?? WIDGET_LABEL[spec.type];
  switch (spec.type) {
    case "lead_count_by_state": {
      const data = await fetchWidgetData("lead_count_by_state", organization_id);
      return (
        <Card data-testid={`widget-${spec.type}`}>
          <CardHeader>
            <CardTitle className="text-sm">{title}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-2">
              {data.map((row) => (
                <div key={row.state} className="flex items-center justify-between">
                  <dt className="text-xs text-neutral-600">
                    {LEAD_STATE_LABEL[row.state] ?? row.state}
                  </dt>
                  <dd className="font-mono text-sm tabular-nums">{row.count}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      );
    }
    case "directive_fires_24h": {
      const data = await fetchWidgetData("directive_fires_24h", organization_id);
      return (
        <Card data-testid={`widget-${spec.type}`}>
          <CardHeader>
            <CardTitle className="text-sm">{title}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold tabular-nums">{data.total}</p>
            <p className="text-xs text-neutral-600">
              {data.dispatched} dispatched · {data.pending_approval} pending ·{" "}
              {data.errored} errored · {data.rate_limited} rate-limited
            </p>
          </CardContent>
        </Card>
      );
    }
    case "active_users_count": {
      const data = await fetchWidgetData("active_users_count", organization_id);
      return (
        <Card data-testid={`widget-${spec.type}`}>
          <CardHeader>
            <CardTitle className="text-sm">{title}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold tabular-nums">{data.count}</p>
            <p className="text-xs text-neutral-600">active org members</p>
          </CardContent>
        </Card>
      );
    }
    case "recent_leads": {
      const data = await fetchWidgetData("recent_leads", organization_id);
      return (
        <Card data-testid={`widget-${spec.type}`}>
          <CardHeader>
            <CardTitle className="text-sm">{title}</CardTitle>
          </CardHeader>
          <CardContent>
            {data.length === 0 ? (
              <p className="text-xs text-neutral-500">No leads yet.</p>
            ) : (
              <ul className="space-y-1">
                {data.map((row) => (
                  <li
                    key={row.id}
                    className="flex items-center justify-between gap-2 text-sm"
                  >
                    <span className="truncate">{row.label}</span>
                    <span className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">
                        {row.state}
                      </Badge>
                      <span className="text-xs text-neutral-500 tabular-nums">
                        {new Date(row.created_at).toLocaleDateString()}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      );
    }
    case "booking_pipeline": {
      const data = await fetchWidgetData("booking_pipeline", organization_id);
      const STAGE_LABEL: Record<string, string> = {
        qualified: "Qualified",
        site_visit_scheduled: "Visit scheduled",
        site_visit_done: "Visit done",
        negotiation: "Negotiation",
        booked: "Booked",
      };
      const max = data.total_at_top;
      const pct = data.conversion_rate_overall * 100;
      return (
        <Card data-testid={`widget-${spec.type}`}>
          <CardHeader>
            <CardTitle className="text-sm">{title}</CardTitle>
          </CardHeader>
          <CardContent>
            {data.total_at_top === 0 ? (
              <p className="text-xs text-neutral-500">
                No deals in the funnel yet.
              </p>
            ) : (
              <div className="space-y-2">
                {data.stages.map((s) => {
                  const proportion = max > 0 ? s.count / max : 0;
                  const isBooked = s.key === "booked";
                  return (
                    <div key={s.key} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-neutral-700">
                          {STAGE_LABEL[s.key] ?? s.key}
                        </span>
                        <span className="font-mono tabular-nums">
                          {s.count}
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-neutral-100 overflow-hidden">
                        <div
                          className={`h-full ${isBooked ? "bg-emerald-500" : "bg-neutral-400"}`}
                          style={{ width: `${(proportion * 100).toFixed(1)}%` }}
                          aria-label={`${s.key} bar`}
                        />
                      </div>
                    </div>
                  );
                })}
                <p className="pt-2 text-xs text-neutral-600">
                  Conversion (booked ÷ qualified):{" "}
                  <span className="font-mono tabular-nums">
                    {pct.toFixed(1)}%
                  </span>
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      );
    }
    case "agent_status": {
      const data = await fetchWidgetData("agent_status", organization_id);
      return (
        <Card data-testid={`widget-${spec.type}`}>
          <CardHeader>
            <CardTitle className="text-sm">{title}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-2xl font-semibold tabular-nums">
                  {data.total_registered}
                </p>
                <p className="text-[10px] text-neutral-500">Registered</p>
              </div>
              <div>
                <p className="text-2xl font-semibold tabular-nums">
                  {data.provisioned}
                </p>
                <p className="text-[10px] text-neutral-500">Provisioned</p>
              </div>
              <div>
                <p className="text-2xl font-semibold tabular-nums text-rose-700">
                  {data.suspended}
                </p>
                <p className="text-[10px] text-neutral-500">Suspended</p>
              </div>
            </div>
          </CardContent>
        </Card>
      );
    }
  }
}
