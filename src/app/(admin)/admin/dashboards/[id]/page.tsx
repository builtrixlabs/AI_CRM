import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { resolveForUser } from "@/lib/auth/permissions";
import { getDashboard } from "@/lib/dashboards/admin";
import { WidgetCard } from "../widget-renderers";

export const dynamic = "force-dynamic";

export default async function DashboardDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");
  if (!user.org_id) redirect("/dashboard");

  const perms = resolveForUser(user);
  if (!perms.has("dashboards:view_org_wide") && !perms.has("dashboards:customize")) {
    redirect("/403");
  }

  const dashboard = await getDashboard(user.org_id, id);
  if (!dashboard) notFound();

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {dashboard.name}
          </h1>
          <p className="text-sm text-neutral-600">
            {dashboard.layout.widgets.length} widget
            {dashboard.layout.widgets.length === 1 ? "" : "s"} · live data
          </p>
        </div>
        <Link
          href="/admin/dashboards"
          className="text-sm text-neutral-700 hover:underline"
        >
          ← All dashboards
        </Link>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {dashboard.layout.widgets.map((w, i) => (
          <WidgetCard
            key={`${w.type}-${i}`}
            spec={w}
            organization_id={user.org_id!}
          />
        ))}
      </div>

      {dashboard.layout.widgets.length === 0 && (
        <div className="rounded-md border bg-white p-12 text-center text-neutral-500">
          This dashboard has no widgets. Edit it to add some.
        </div>
      )}
    </div>
  );
}
