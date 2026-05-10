import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { BASE_ROLE_PERMS } from "@/lib/auth/rbac";
import { getBillingSnapshot } from "@/lib/admin/billing";
import { UpgradeForm } from "./upgrade-form";

export const dynamic = "force-dynamic";

const inrFmt = new Intl.NumberFormat("en-IN");

function UsageBar({
  label,
  current,
  limit,
}: {
  label: string;
  current: number;
  limit: number;
}) {
  const pct = limit > 0 ? Math.min(100, (current / limit) * 100) : 0;
  const over = limit > 0 && current > limit;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-neutral-700">{label}</span>
        <span className="font-mono tabular-nums">
          {current} / {limit > 0 ? limit : "—"}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-neutral-100 overflow-hidden">
        <div
          className={`h-full ${over ? "bg-rose-500" : "bg-neutral-700"}`}
          style={{ width: `${pct.toFixed(1)}%` }}
        />
      </div>
    </div>
  );
}

export default async function BillingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");
  if (!user.org_id) redirect("/admin");
  if (!BASE_ROLE_PERMS[user.profile.base_role].has("billing:view")) {
    redirect("/403");
  }

  const snap = await getBillingSnapshot(user.org_id);

  return (
    <div className="space-y-6 max-w-3xl">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
        <p className="text-sm text-neutral-600">
          Subscription, usage against tier limits, and self-service plan-upgrade
          request.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Current plan</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3">
            <Badge variant="secondary" className="capitalize">
              {snap.limits.display_name}
            </Badge>
            <Badge variant={snap.status === "active" ? "default" : "outline"}>
              {snap.status}
            </Badge>
            {snap.current_period_end && (
              <span className="text-xs text-neutral-500">
                Period ends {new Date(snap.current_period_end).toLocaleDateString()}
              </span>
            )}
          </div>
          <p className="text-sm text-neutral-700">
            {snap.limits.monthly_price_inr === null
              ? "Custom contract pricing."
              : snap.limits.monthly_price_inr === 0
                ? "Free tier — pilot only."
                : `₹${inrFmt.format(snap.limits.monthly_price_inr)} / month.`}
          </p>
          <ul className="text-xs text-neutral-600 list-disc list-inside">
            {snap.limits.features.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Usage vs. tier limits</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <UsageBar
            label="Active users"
            current={snap.usage.active_users}
            limit={snap.limits.max_users}
          />
          <UsageBar
            label="Active properties"
            current={0}
            limit={snap.limits.max_active_properties}
          />
          <UsageBar
            label="Workspaces"
            current={snap.usage.workspaces}
            limit={9999}
          />
          <UsageBar
            label="Leads (last 30d)"
            current={snap.usage.leads_30d}
            limit={snap.limits.max_bookings_per_month * 4}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Request plan upgrade</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-neutral-600 pb-3">
            Files a support ticket with your reason. The Builtrix team picks it
            up from{" "}
            <code className="font-mono">/platform/tickets</code>.
          </p>
          <UpgradeForm current_tier={snap.plan_tier} />
        </CardContent>
      </Card>
    </div>
  );
}
