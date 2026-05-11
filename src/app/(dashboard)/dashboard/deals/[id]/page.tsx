import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { getDealCanvas } from "@/lib/deals/api";
import { DEAL_STAGE_ORDER, type DealStage } from "@/lib/deals/transitions";
import { getDealBookingState } from "@/lib/booking/api";
import { DealStageTracker } from "@/components/canvas/deal-stage-tracker";

export const dynamic = "force-dynamic";

const STAGE_LABEL: Record<DealStage, string> = {
  qualified: "Qualified",
  site_visit_scheduled: "Site visit scheduled",
  site_visit_done: "Site visit done",
  negotiation: "Negotiation",
  booked: "Booked",
  lost: "Lost",
};

const STAGE_TINT: Record<DealStage, string> = {
  qualified: "bg-neutral-100 text-neutral-700",
  site_visit_scheduled: "bg-blue-100 text-blue-900",
  site_visit_done: "bg-indigo-100 text-indigo-900",
  negotiation: "bg-amber-100 text-amber-900",
  booked: "bg-emerald-100 text-emerald-900",
  lost: "bg-rose-100 text-rose-900",
};

const dateFmt = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
});

function inr(amount: number | null): string {
  if (amount === null || amount === 0) return "—";
  if (amount >= 10_000_000) return `₹${(amount / 10_000_000).toFixed(2)}Cr`;
  if (amount >= 100_000) return `₹${(amount / 100_000).toFixed(2)}L`;
  return `₹${amount.toLocaleString("en-IN")}`;
}

export default async function DealCanvasPage(props: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");
  if (!user.org_id) redirect("/dashboard");

  const { id } = await props.params;
  const [data, bookingState] = await Promise.all([
    getDealCanvas(id),
    getDealBookingState(id),
  ]);
  if (!data) notFound();

  const { deal, leads, units, activities } = data;
  const currentStageIdx = DEAL_STAGE_ORDER.indexOf(
    deal.stage as (typeof DEAL_STAGE_ORDER)[number]
  );

  // D-421: post-EOI booking pipeline (orthogonal to the pre-EOI sales funnel
  // rendered below). currentStage defaults to 'eoi' for any deal that hasn't
  // been explicitly transitioned — matches the migration backfill.
  const bookingCurrentStage = bookingState.currentStage ?? "eoi";
  const isOrgAdmin =
    user.profile.base_role === "super_admin" ||
    user.profile.base_role === "org_owner" ||
    user.profile.base_role === "org_admin";

  return (
    <div className="space-y-6 max-w-5xl">
      <header className="space-y-2">
        <Link
          href="/dashboard"
          className="text-xs text-neutral-500 hover:text-neutral-900"
        >
          ← Back to dashboard
        </Link>
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{deal.label}</h1>
          <span
            className={`text-xs px-2 py-1 rounded-md ${STAGE_TINT[deal.stage]}`}
          >
            {STAGE_LABEL[deal.stage]}
          </span>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Stage timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-1 overflow-x-auto">
            {DEAL_STAGE_ORDER.map((s, i) => {
              const reached = i <= currentStageIdx && deal.stage !== "lost";
              return (
                <div key={s} className="flex items-center gap-1 shrink-0">
                  <div
                    className={`text-xs px-2 py-1 rounded-md ${
                      reached
                        ? STAGE_TINT[s]
                        : "bg-neutral-50 text-neutral-400"
                    }`}
                  >
                    {STAGE_LABEL[s]}
                  </div>
                  {i < DEAL_STAGE_ORDER.length - 1 && (
                    <span className="text-xs text-neutral-400">→</span>
                  )}
                </div>
              );
            })}
            {deal.stage === "lost" && (
              <span
                className={`text-xs px-2 py-1 rounded-md ml-2 ${STAGE_TINT.lost}`}
              >
                Lost
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      <DealStageTracker
        dealId={deal.id}
        currentStage={bookingCurrentStage}
        transitions={bookingState.transitions}
        isOrgAdmin={isOrgAdmin}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Deal info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <p className="text-xs text-neutral-500">Value</p>
              <p className="font-mono tabular-nums">{inr(deal.value_inr)}</p>
            </div>
            <div>
              <p className="text-xs text-neutral-500">Expected close</p>
              <p className="tabular-nums">
                {deal.expected_close_at
                  ? dateFmt.format(new Date(deal.expected_close_at))
                  : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-neutral-500">Owner</p>
              <p className="font-mono text-xs">
                {deal.owner_id ?? "Unassigned"}
              </p>
            </div>
            <div>
              <p className="text-xs text-neutral-500">Created</p>
              <p>{dateFmt.format(new Date(deal.created_at))}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">
              Linked leads ({leads.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {leads.length === 0 ? (
              <p className="text-sm text-neutral-500">No leads linked yet.</p>
            ) : (
              <ul className="divide-y">
                {leads.map((l) => (
                  <li key={l.id} className="py-2 flex items-center justify-between">
                    <Link
                      href={`/dashboard/leads/${l.id}`}
                      className="text-sm hover:underline"
                    >
                      {l.label}
                    </Link>
                    <span className="text-xs text-neutral-500">
                      {l.state ?? "—"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Linked units ({units.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {units.length === 0 ? (
            <p className="text-sm text-neutral-500">No units linked yet.</p>
          ) : (
            <ul className="divide-y">
              {units.map((u) => (
                <li key={u.id} className="py-2 flex items-center justify-between">
                  <span className="font-mono text-sm">{u.unit_no}</span>
                  <span className="text-xs text-neutral-500">{u.status}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Activity stream ({activities.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {activities.length === 0 ? (
            <p className="text-sm text-neutral-500">No activity recorded yet.</p>
          ) : (
            <ul className="space-y-2">
              {activities.slice(0, 25).map((a) => (
                <li key={a.id} className="text-sm">
                  <span className="font-medium">{a.label}</span>{" "}
                  <span className="text-xs text-neutral-500">
                    · {dateFmt.format(new Date(a.created_at))} · {a.created_via}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
