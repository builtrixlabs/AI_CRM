import Link from "next/link";
import { redirect } from "next/navigation";
import { Sparkles, Mic, Boxes, Scale } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ComplianceBadges } from "@/components/compliance/compliance-badges";
import { SiteVisitCalendar } from "@/components/cockpit/site-visit-calendar";
import { OnboardingBanner } from "@/components/admin/onboarding-banner";
import { IntegrationFailureBanner } from "@/components/admin/integration-failure-banner";
import { AppAccessCard, type AppEntry } from "@/components/admin/app-access-card";
import { getCockpitData } from "@/lib/admin";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { getSiteVisitCalendar } from "@/lib/sitevisits/calendar";

export const dynamic = "force-dynamic";

const PLAN_LABEL: Record<string, string> = {
  starter: "Starter",
  professional: "Professional",
  enterprise: "Enterprise",
  custom: "Custom",
};

const APPS: AppEntry[] = [
  {
    slug: "crm",
    name: "AI CRM",
    description: "Lead-to-booking pipeline + AI orchestration. This product.",
    status: "active",
    Icon: Sparkles,
    href: "/dashboard",
  },
  {
    slug: "voice_iq",
    name: "Voice IQ",
    description: "Call audit + BANT scoring. Already integrated.",
    status: "active",
    Icon: Mic,
    href: "/admin/integrations/voice-iq",
  },
  {
    slug: "pscrm",
    name: "Post-Sales CRM",
    description: "Bookings, demand letters, possession, registration.",
    status: "coming_soon",
    Icon: Boxes,
  },
  {
    slug: "legal_auditor",
    name: "Legal Auditor",
    description: "Document auditing + compliance flagging.",
    status: "coming_soon",
    Icon: Scale,
  },
];

export default async function AdminCockpitPage(props: {
  searchParams: Promise<{ onboarded?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");
  if (!user.org_id) redirect("/dashboard");

  const [data, siteVisitDays] = await Promise.all([
    getCockpitData(user.org_id),
    getSiteVisitCalendar(user.org_id),
  ]);
  const sp = await props.searchParams;
  const justFinished = sp.onboarded === "1";

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Admin cockpit</h1>
        <p className="text-sm text-muted-foreground">
          Account state · configuration · customization. Operational work
          happens on the dashboard.
        </p>
        <ComplianceBadges
          rera_number={data.compliance.rera_number}
          gstin={data.compliance.gstin}
        />
      </header>

      {justFinished && (
        <div
          className="rounded-md border p-4 text-sm"
          style={{
            background: "color-mix(in oklch, var(--cc-mint-500) 8%, transparent)",
            borderColor: "color-mix(in oklch, var(--cc-mint-500) 35%, transparent)",
          }}
        >
          Onboarding complete. You can revisit any step from the Onboarding link.
        </div>
      )}

      <OnboardingBanner
        completed={data.onboarding.completed}
        currentStep={data.onboarding.current_step}
      />

      {/* Integration failure banners — wire to live failed_jobs counts in
          a follow-up directive once D-434+ land per-channel queues. */}
      <IntegrationFailureBanner channel="email" count={0} />
      <IntegrationFailureBanner channel="telephony" count={0} />

      {/* Row 1 — Account state */}
      <section className="space-y-3">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Account state
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
                <p className="text-sm text-muted-foreground">Not provisioned.</p>
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
              <p className="text-muted-foreground">
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
              <p className="text-sm text-muted-foreground">open tickets</p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Site visit calendar (D-222) */}
      <section className="space-y-3">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Site visits · next 7 days
        </h2>
        <SiteVisitCalendar days={siteVisitDays} />
      </section>

      {/* Row 2 — Configuration */}
      <section className="space-y-3">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Configuration
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
                className="text-sm underline"
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
              <p className="text-sm text-muted-foreground">
                Email · WhatsApp · Telephony · SMS providers.
              </p>
              <Link
                href="/admin/integrations"
                className="text-sm underline"
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
              <p className="text-sm text-muted-foreground">
                CRM, Voice IQ, sister products.
              </p>
              <Link
                href="/admin/apps"
                className="text-sm underline"
              >
                View app access →
              </Link>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Row 3 — Customization */}
      <section className="space-y-3">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Customization
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Dashboards</CardTitle>
            </CardHeader>
            <CardContent>
              <Link
                href="/admin/dashboards"
                className="text-sm underline"
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
                className="text-sm underline"
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
                className="text-sm underline"
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
                className="text-sm underline"
              >
                Author directives →
              </Link>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* App access — full grid below Customization */}
      <section className="space-y-3">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          App access
        </h2>
        <AppAccessCard apps={APPS} />
      </section>
    </div>
  );
}
