import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { resolveForUser } from "@/lib/auth/permissions";
import { listDashboards } from "@/lib/dashboards/admin";
import { WIDGET_LABEL } from "@/lib/dashboards/types";
import { dashboardsFormAction } from "./actions";
import { NewDashboardDialog } from "./new-dashboard-dialog";

export const dynamic = "force-dynamic";

export default async function AdminDashboardsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");
  if (!user.org_id) redirect("/dashboard");

  const perms = resolveForUser(user);
  if (!perms.has("dashboards:customize")) redirect("/403");

  const dashboards = await listDashboards(user.org_id);

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboards</h1>
          <p className="text-sm text-neutral-600">
            Compose at-a-glance views from the built-in widget catalog. Open
            any dashboard to see live data computed from the org&apos;s tables.
          </p>
        </div>
        <NewDashboardDialog />
      </header>

      {dashboards.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-neutral-500">
            No dashboards yet. Click &quot;+ New dashboard&quot; to build one.
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {dashboards.map((d) => (
          <Card key={d.id} data-testid={`dashboard-${d.id}`}>
            <CardHeader>
              <CardTitle className="text-base flex items-center justify-between">
                <Link
                  href={`/admin/dashboards/${d.id}`}
                  className="hover:underline"
                >
                  {d.name}
                </Link>
                <Badge variant="secondary" className="text-[10px]">
                  {d.layout.widgets.length} widget
                  {d.layout.widgets.length === 1 ? "" : "s"}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <ul className="space-y-0.5 text-xs text-neutral-600">
                {d.layout.widgets.slice(0, 4).map((w, i) => (
                  <li key={i} className="font-mono">
                    · {WIDGET_LABEL[w.type]}
                  </li>
                ))}
                {d.layout.widgets.length > 4 && (
                  <li className="text-neutral-400">
                    + {d.layout.widgets.length - 4} more…
                  </li>
                )}
              </ul>
              <div className="flex justify-between items-center pt-2 border-t">
                <span className="text-xs text-neutral-500">
                  {new Date(d.created_at).toLocaleDateString()}
                </span>
                <div className="flex items-center gap-3">
                  {perms.has("dashboards:publish_to_team") && (
                    <Link
                      href={`/admin/dashboards/${d.id}/teams`}
                      className="text-xs underline text-neutral-600 hover:text-foreground"
                      data-testid={`publish-dashboard-${d.id}`}
                    >
                      Publish to team
                    </Link>
                  )}
                  <form action={dashboardsFormAction}>
                    <input type="hidden" name="intent" value="delete" />
                    <input type="hidden" name="id" value={d.id} />
                    <button
                      type="submit"
                      className="text-xs text-rose-700 hover:underline"
                      data-testid={`delete-dashboard-${d.id}`}
                      onClick={(e) => {
                        if (
                          !confirm(`Delete dashboard "${d.name}"?`)
                        ) {
                          e.preventDefault();
                        }
                      }}
                    >
                      Delete
                    </button>
                  </form>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
