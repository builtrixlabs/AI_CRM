import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { resolveForUser } from "@/lib/auth/permissions";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { listSiteVisits, type SiteVisitFilters } from "@/lib/sitevisits/list";
import { getCoordinatorForDate } from "@/lib/sitevisits/coordinator";
import { istDayKey } from "@/lib/sitevisits/ist";
import type { SiteVisitState } from "@/lib/sitevisits/transitions";
import { SiteVisitFilterBar } from "@/components/sitevisits/site-visit-filter-bar";
import { SiteVisitListTable } from "@/components/sitevisits/site-visit-list-table";
import { CoordinatorClaimBanner } from "@/components/sitevisits/coordinator-claim-banner";

export const dynamic = "force-dynamic";

const VALID_STATUSES: ReadonlySet<string> = new Set<SiteVisitState>([
  "draft",
  "scheduled",
  "confirmed",
  "in_progress",
  "completed",
  "cancelled",
  "no_show",
]);

/**
 * D-602 Site Visit Module — list + filters + coordinator desk.
 * Replaces the Phase-0 placeholder. The D-222 cockpit calendar widget
 * links day cells here via `?date=YYYY-MM-DD`.
 */
export default async function SiteVisitsPage(props: {
  searchParams: Promise<{
    date?: string;
    bucket?: string;
    status?: string;
    project?: string;
    sales_rep?: string;
    coordinator?: string;
  }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");
  if (!user.org_id) {
    return (
      <main className="mx-auto max-w-5xl p-12">
        <p className="text-sm text-muted-foreground">
          Your account is not yet linked to an organization. Contact your
          admin.
        </p>
      </main>
    );
  }
  const perms = resolveForUser(user);
  if (!perms.has("site_visits:view")) redirect("/403");

  const sp = await props.searchParams;

  const filters: SiteVisitFilters = {};
  if (sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date)) {
    filters.date = sp.date;
  } else if (sp.bucket === "today") {
    filters.bucket = "today";
  } else if (sp.bucket === "all") {
    // no date filter — show every visit
  } else {
    filters.bucket = "upcoming";
  }
  if (sp.status && VALID_STATUSES.has(sp.status)) {
    filters.status = sp.status as SiteVisitState;
  }
  if (sp.project) filters.project_id = sp.project;
  if (sp.sales_rep) filters.sales_rep_id = sp.sales_rep;
  if (sp.coordinator) filters.coordinator_id = sp.coordinator;

  const rows = await listSiteVisits({
    organization_id: user.org_id,
    viewer: { user_id: user.user.id, base_role: user.profile.base_role },
    filters,
  });

  // Coordinator banner — the day it coordinates is the explicit ?date= or
  // today (IST). Resolve the current claimant's display name for display.
  const coordinationDate = filters.date ?? istDayKey(new Date());
  const claim = await getCoordinatorForDate(user.org_id, coordinationDate);
  let claimedByLabel: string | null = null;
  let claimedBySelf = false;
  if (claim) {
    claimedBySelf = claim.coordinator_id === user.user.id;
    if (claimedBySelf) {
      claimedByLabel = user.profile.display_name;
    } else {
      const { data: prof } = await getSupabaseAdmin()
        .from("profiles")
        .select("display_name")
        .eq("id", claim.coordinator_id)
        .maybeSingle();
      claimedByLabel =
        (prof as { display_name: string } | null)?.display_name ??
        claim.coordinator_id;
    }
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-8">
      <header className="space-y-1">
        <h1
          className="text-2xl font-semibold tracking-tight"
          data-testid="site-visits-title"
        >
          Site Visits
        </h1>
        <p className="text-sm text-muted-foreground">
          Upcoming visits, cab logistics, and the coordinator desk.
        </p>
      </header>

      <CoordinatorClaimBanner
        date={coordinationDate}
        claimedBySelf={claimedBySelf}
        claimedByLabel={claimedByLabel}
        canCoordinate={perms.has("site_visits:coordinate")}
      />

      <SiteVisitFilterBar />

      <SiteVisitListTable rows={rows} />
    </main>
  );
}
