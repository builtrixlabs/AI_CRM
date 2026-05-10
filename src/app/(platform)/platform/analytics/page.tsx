import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sparkline } from "@/components/platform/sparkline";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { getKpisOverWindow, getPlatformKpis } from "@/lib/platform/analytics";
import { PLAN_TIERS, PLAN_TIER_ORDER } from "@/lib/platform/plan-tiers";
import { CsvButton } from "./csv-button";

export const dynamic = "force-dynamic";

const fmt = new Intl.NumberFormat("en-US");
const VALID_DAYS = [30, 60, 90] as const;
type WindowDays = (typeof VALID_DAYS)[number];

function parseDays(raw: string | string[] | undefined): WindowDays {
  const n = typeof raw === "string" ? Number(raw) : NaN;
  return (VALID_DAYS as readonly number[]).includes(n) ? (n as WindowDays) : 30;
}

export default async function AnalyticsPage(props: {
  searchParams: Promise<{ days?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");
  if (user.profile.base_role !== "super_admin") redirect("/dashboard");

  const sp = await props.searchParams;
  const days = parseDays(sp.days);

  const [k, buckets] = await Promise.all([
    getPlatformKpis(),
    getKpisOverWindow(days),
  ]);
  const bookings = buckets.map((b) => b.bookings);
  const svCompleted = buckets.map((b) => b.sv_completed);
  const totalBookings = bookings.reduce((s, n) => s + n, 0);
  const totalSv = svCompleted.reduce((s, n) => s + n, 0);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
        <p className="text-sm text-neutral-600">
          Real-estate-relevant cross-org metrics. Refreshes on every page load.
        </p>
      </header>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-neutral-700">
            Trends ({days}d)
          </h2>
          <div className="flex gap-1 text-xs">
            {VALID_DAYS.map((d) => (
              <Link
                key={d}
                href={`/platform/analytics?days=${d}`}
                className={`rounded border px-2 py-1 ${
                  d === days
                    ? "border-neutral-900 bg-neutral-900 text-white"
                    : "border-neutral-300 text-neutral-700"
                }`}
              >
                {d}d
              </Link>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Bookings / day</CardTitle>
              <CsvButton kpi="bookings" days={days} />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold tabular-nums">
                {fmt.format(totalBookings)}
              </p>
              <p className="text-xs text-neutral-500 pt-1">
                total in last {days} days
              </p>
              <Sparkline
                values={bookings}
                width={280}
                height={48}
                strokeColor="#0f766e"
                fillColor="#14b8a6"
                className="mt-3 text-emerald-700"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">
                Site visits completed / day
              </CardTitle>
              <CsvButton kpi="sv_completed" days={days} />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold tabular-nums">
                {fmt.format(totalSv)}
              </p>
              <p className="text-xs text-neutral-500 pt-1">
                total in last {days} days
              </p>
              <Sparkline
                values={svCompleted}
                width={280}
                height={48}
                strokeColor="#1e40af"
                fillColor="#3b82f6"
                className="mt-3 text-blue-700"
              />
            </CardContent>
          </Card>
        </div>
      </section>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Orgs by plan tier</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {PLAN_TIER_ORDER.map((t) => {
                const n = k.orgs_by_plan_tier[t];
                const pct =
                  k.total_orgs > 0 ? (n / k.total_orgs) * 100 : 0;
                return (
                  <div key={t} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="capitalize text-neutral-700">
                        {PLAN_TIERS[t].display_name}
                      </span>
                      <span className="font-mono tabular-nums">
                        {n} ({pct.toFixed(0)}%)
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-neutral-100 overflow-hidden">
                      <div
                        className="h-full bg-neutral-700"
                        style={{ width: `${pct.toFixed(1)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
              <p className="pt-2 text-xs text-neutral-500">
                Total orgs: <span className="font-mono">{k.total_orgs}</span>
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Lead-to-booking conversion</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold tabular-nums">
              {k.conversion.rate_pct.toFixed(1)}%
            </p>
            <p className="text-xs text-neutral-600 pt-1">
              {fmt.format(k.conversion.booked)} booked /{" "}
              {fmt.format(k.conversion.qualified_or_later)} qualified-or-later
              deals
            </p>
            <p className="text-xs text-neutral-500 pt-2">
              Funnel: qualified → site_visit_scheduled → site_visit_done →
              negotiation → booked.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Site-visit cadence (30d)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-2xl font-semibold tabular-nums">
                  {k.site_visits_30d.scheduled}
                </p>
                <p className="text-xs text-neutral-500">scheduled</p>
              </div>
              <div>
                <p className="text-2xl font-semibold tabular-nums text-emerald-700">
                  {k.site_visits_30d.confirmed}
                </p>
                <p className="text-xs text-neutral-500">confirmed</p>
              </div>
              <div>
                <p className="text-2xl font-semibold tabular-nums">
                  {k.site_visits_30d.completed}
                </p>
                <p className="text-xs text-neutral-500">completed</p>
              </div>
              <div>
                <p className="text-2xl font-semibold tabular-nums text-rose-700">
                  {k.site_visits_30d.no_show}
                </p>
                <p className="text-xs text-neutral-500">no-show</p>
              </div>
            </div>
            <p className="text-xs text-neutral-500 pt-3">
              Total: <span className="font-mono">{k.site_visits_30d.total}</span>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Voice IQ adoption</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold tabular-nums">
              {k.voice_iq_adoption.rate_pct.toFixed(0)}%
            </p>
            <p className="text-xs text-neutral-600 pt-1">
              {k.voice_iq_adoption.orgs_with_voice_iq} /{" "}
              {k.voice_iq_adoption.total_orgs} orgs configured
            </p>
            <div className="mt-3 h-1.5 rounded-full bg-neutral-100 overflow-hidden">
              <div
                className="h-full bg-emerald-600"
                style={{ width: `${k.voice_iq_adoption.rate_pct.toFixed(1)}%` }}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
