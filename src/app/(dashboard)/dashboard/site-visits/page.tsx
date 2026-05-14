import Link from "next/link";

export const dynamic = "force-dynamic";

/**
 * D-602 Site Visit Module surface — Phase 0 placeholder.
 *
 * V6 Phase 1 step 1.5 (D-602) replaces this with the real Site Visits
 * list + filters + detail view + coordinator dashboard. For Phase 0 this
 * exists only so the D-222 site-visit calendar widget's day-cell links
 * (which target /dashboard/site-visits?date=YYYY-MM-DD) resolve instead
 * of 404ing — see implementation-order §4 step 0.7.
 */
export default async function SiteVisitsPage(props: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date } = await props.searchParams;

  return (
    <main className="mx-auto max-w-3xl p-12">
      <h1
        className="text-2xl font-semibold tracking-tight"
        data-testid="site-visits-placeholder-title"
      >
        Site Visits
      </h1>
      <div
        data-testid="site-visits-placeholder-banner"
        className="mt-6 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"
      >
        The Site Visits module — list, filters, detail view, and the
        coordinator dashboard — lands in V6 Phase 1 (D-602).
        {date ? ` Requested date: ${date}.` : ""}
      </div>
      <p className="mt-6 text-sm">
        <Link href="/dashboard" className="underline">
          ← Back to dashboard
        </Link>
      </p>
    </main>
  );
}
