import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ComplianceBadges } from "@/components/compliance/compliance-badges";
import { getCockpitData, STEP_IDS } from "@/lib/admin";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";

export const dynamic = "force-dynamic";

const PLAN_LABEL: Record<string, string> = {
  starter: "Starter",
  professional: "Professional",
  enterprise: "Enterprise",
  custom: "Custom",
};

export default async function AdminCockpitPage(props: {
  searchParams: Promise<{ onboarded?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");
  if (!user.org_id) redirect("/dashboard");

  const data = await getCockpitData(user.org_id);
  const sp = await props.searchParams;
  const justFinished = sp.onboarded === "1";

  const stepNumber =
    data.onboarding.completed
      ? null
      : (STEP_IDS as readonly string[]).indexOf(
          data.onboarding.current_step
        ) + 1;

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Admin cockpit</h1>
        <p className="text-sm text-neutral-600">
          Account state · configuration · customization. Operational work
          happens on the dashboard.
        </p>
        <ComplianceBadges
          rera_number={data.compliance.rera_number}
          gstin={data.compliance.gstin}
        />
      </header>

      {justFinished && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 text-emerald-900 p-4 text-sm">
          Onboarding complete. You can revisit any step from the Onboarding link.
        </div>
      )}

      {!data.onboarding.completed && (
        <div className="rounded-md border border-amber-300 bg-amber-50 text-amber-900 p-4 text-sm flex items-center justify-between">
          <span>
            Resume onboarding · step {stepNumber} of 8
            {data.onboarding.current_step !== "completed"
              ? ` (${data.onboarding.current_step.replace(/_/g, " ")})`
              : ""}
          </span>
          <Link
            href="/admin/onboarding"
            className="rounded-md bg-amber-900 text-amber-50 text-xs px-3 py-1.5"
          >
            Resume →
          </Link>
        </div>
      )}

      {/* Row 1 — Account state */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-neutral-500 uppercase tracking-wide">
          Account state
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Subscription</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.subscription ? (
                <>
                  <p className="text-2xl font-semibold">
                    {PLAN_LABEL[data.subscription.plan_tier] ??
                      data.subscription.plan_tier}
                  </p>
                  <Badge variant="secondary" className="capitalize">
                    {data.subscription.status}
                  </Badge>
                </>
              ) : (
                <p className="text-neutral-500 text-sm">Not provisioned.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Plan usage</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p>
                Active users:{" "}
                <span className="font-mono">{data.usage.active_users}</span>
              </p>
              <p>
                Workspaces:{" "}
                <span className="font-mono">{data.usage.workspaces}</span>
              </p>
              <p>
                Leads (30d):{" "}
                <span className="font-mono">{data.usage.leads_30d}</span>
              </p>
              <p className="text-neutral-500">
                AI tokens: <span className="font-mono">— / cap</span>
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Support</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-2xl font-semibold tabular-nums">
                {data.open_tickets}
              </p>
              <p className="text-sm text-neutral-600">open tickets</p>
              <Link
                href="/admin/support/new"
                className="text-sm underline text-neutral-900"
              >
                File new →
              </Link>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Row 2 — Configuration */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-neutral-500 uppercase tracking-wide">
          Configuration
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Users</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold tabular-nums">
                {data.usage.active_users}
              </p>
              <Link
                href="/settings/users"
                className="text-sm underline text-neutral-900"
              >
                Manage users →
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Integrations</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-neutral-600">
                Email · WhatsApp · Telephony providers.
              </p>
              <Link
                href="/settings/integrations"
                className="text-sm underline text-neutral-900"
              >
                Manage integrations →
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">App access</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-neutral-600">
                CRM (this) · Call Audit · Legal Auditor.
              </p>
              <p className="text-xs text-neutral-500 mt-2">
                Cross-product access lands in a later directive.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Row 3 — Customization */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-neutral-500 uppercase tracking-wide">
          Customization
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Dashboards</CardTitle>
            </CardHeader>
            <CardContent>
              <Link
                href="/admin/dashboards"
                className="text-sm underline text-neutral-900"
              >
                Configure dashboards →
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Tables &amp; fields</CardTitle>
            </CardHeader>
            <CardContent>
              <Link
                href="/admin/tables"
                className="text-sm underline text-neutral-900"
              >
                Configure tables →
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">AI agents</CardTitle>
            </CardHeader>
            <CardContent>
              <Link
                href="/admin/agents"
                className="text-sm underline text-neutral-900"
              >
                Provision agents →
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Directives</CardTitle>
            </CardHeader>
            <CardContent>
              <Link
                href="/admin/directives"
                className="text-sm underline text-neutral-900"
              >
                Author directives →
              </Link>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
