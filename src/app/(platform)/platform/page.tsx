import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { platformCounts } from "@/lib/platform/queries";

export const dynamic = "force-dynamic";

export default async function PlatformHomePage() {
  const counts = await platformCounts();

  const kpis = [
    { label: "Total organizations", value: counts.total_orgs },
    { label: "Active", value: counts.active_orgs },
    { label: "Org admins", value: counts.org_admins },
  ];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Platform</h1>
        <p className="text-sm text-neutral-600">
          Provisioning and platform administration. No operational data is
          accessible from this surface.
        </p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label}>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-neutral-500">
                {kpi.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold tabular-nums">
                {kpi.value}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quick actions</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <p>
            <a
              href="/platform/organizations/new"
              className="underline text-neutral-900"
            >
              Provision a new organization →
            </a>
          </p>
          <p>
            <a
              href="/platform/organizations"
              className="underline text-neutral-900"
            >
              View existing organizations →
            </a>
          </p>
          <p>
            <a href="/platform/audit" className="underline text-neutral-900">
              View platform-wide audit log →
            </a>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
