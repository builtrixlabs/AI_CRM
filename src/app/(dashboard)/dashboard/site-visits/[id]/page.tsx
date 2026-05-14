import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { resolveForUser } from "@/lib/auth/permissions";
import { getSiteVisitDetail } from "@/lib/sitevisits/detail";
import {
  allowedTransitions,
  type SiteVisitState,
} from "@/lib/sitevisits/transitions";
import {
  SiteVisitStatusControl,
  STATE_LABEL,
} from "@/components/sitevisits/site-visit-status-control";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

function fmt(iso: string | null | undefined, tz = "Asia/Kolkata"): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: tz,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

function str(v: unknown): string {
  return typeof v === "string" && v.length > 0 ? v : "—";
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="text-right font-medium">{v}</dd>
    </div>
  );
}

/** D-602 Site Visit detail — metadata, cab block, status workflow, history. */
export default async function SiteVisitDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");
  if (!user.org_id) redirect("/dashboard");
  const perms = resolveForUser(user);
  if (!perms.has("site_visits:view")) redirect("/403");

  const detail = await getSiteVisitDetail(id, user.org_id);
  if (!detail) notFound();

  const state = (detail.state ?? "scheduled") as SiteVisitState;
  const d = detail.data;
  const canEdit =
    perms.has("site_visits:edit") || perms.has("site_visits:cancel");

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-8">
      <header className="space-y-1">
        <div className="flex items-center gap-3">
          <h1
            className="text-2xl font-semibold tracking-tight"
            data-testid="site-visit-detail-title"
          >
            Site Visit
          </h1>
          <Badge variant="secondary" data-testid="sv-detail-state">
            {STATE_LABEL[state]}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {detail.lead_label ?? detail.lead_id ?? "Unknown lead"} · scheduled{" "}
          {fmt(typeof d.scheduled_at === "string" ? d.scheduled_at : null)}
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-md border border-border bg-card p-4 text-sm">
          <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Visit
          </h2>
          <dl className="space-y-1">
            <Row k="Lead" v={detail.lead_label ?? str(d.lead_id)} />
            <Row
              k="Scheduled"
              v={fmt(
                typeof d.scheduled_at === "string" ? d.scheduled_at : null,
              )}
            />
            <Row k="Project" v={str(d.project_id)} />
            <Row k="Sales rep" v={str(d.assigned_sales_rep_id)} />
            <Row k="Coordinator" v={str(d.coordinator_id)} />
            <Row k="Notes" v={str(d.notes)} />
          </dl>
        </div>
        <div className="rounded-md border border-border bg-card p-4 text-sm">
          <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Cab logistics
          </h2>
          <dl className="space-y-1">
            <Row k="Provider" v={str(d.cab_provider)} />
            <Row k="Booking ref" v={str(d.cab_booking_ref)} />
            <Row k="Driver" v={str(d.driver_name)} />
            <Row k="Driver phone" v={str(d.driver_phone)} />
            <Row k="Vehicle" v={str(d.vehicle_number)} />
            <Row k="Pickup" v={str(d.pickup_address)} />
            <Row
              k="Pickup time"
              v={fmt(typeof d.pickup_time === "string" ? d.pickup_time : null)}
            />
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">
            Cab details are entered by the Site Visit Booking Agent (D-601).
          </p>
        </div>
      </section>

      <section className="rounded-md border border-border bg-card p-4">
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Status workflow
        </h2>
        {canEdit ? (
          <SiteVisitStatusControl
            id={detail.id}
            currentState={state}
            allowed={[...allowedTransitions(state)]}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            You don&apos;t have permission to change this visit&apos;s status.
          </p>
        )}
      </section>

      <section className="rounded-md border border-border bg-card p-4">
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Activity history
        </h2>
        {detail.history.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No recorded activity.
          </p>
        ) : (
          <ul className="space-y-2" data-testid="sv-history">
            {detail.history.map((h, i) => {
              const diffTo =
                h.diff && typeof h.diff === "object" && "to" in h.diff
                  ? String((h.diff as Record<string, unknown>).to)
                  : null;
              return (
                <li
                  key={`${h.ts}-${i}`}
                  className="flex items-baseline justify-between gap-4 text-sm"
                >
                  <span>
                    <span className="font-medium">{h.action}</span>
                    {diffTo ? (
                      <span className="text-muted-foreground">
                        {" "}
                        → {diffTo}
                      </span>
                    ) : null}
                  </span>
                  <time
                    className="shrink-0 text-xs text-muted-foreground"
                    dateTime={h.ts}
                  >
                    {fmt(h.ts)}
                  </time>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
