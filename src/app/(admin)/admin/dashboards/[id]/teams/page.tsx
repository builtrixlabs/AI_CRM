import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { resolveForUser } from "@/lib/auth/permissions";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getDashboard } from "@/lib/dashboards/admin";
import { listAssignmentsForDashboard } from "@/lib/dashboards/team-scoping";
import { PublishToTeamForm } from "./publish-form";
import { RevokeButton } from "./revoke-button";

export const dynamic = "force-dynamic";

type Team = { id: string; name: string };

export default async function DashboardTeamsPage(props: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");
  if (!user.org_id) redirect("/dashboard");
  const perms = resolveForUser(user);
  if (!perms.has("dashboards:publish_to_team")) redirect("/403");

  const { id } = await props.params;
  const dashboard = await getDashboard(user.org_id, id);
  if (!dashboard) notFound();

  const [assignments, { data: teams }] = await Promise.all([
    listAssignmentsForDashboard({
      organization_id: user.org_id,
      dashboard_id: id,
    }),
    getSupabaseAdmin()
      .from("teams")
      .select("id, name")
      .eq("organization_id", user.org_id)
      .is("deleted_at", null)
      .order("name"),
  ]);
  const teamList = (teams ?? []) as Team[];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-1">
        <p className="text-xs text-muted-foreground">
          <Link href="/admin/dashboards" className="underline">
            Dashboards
          </Link>{" "}
          / <span>{dashboard.name}</span>
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">
          Publish — {dashboard.name}
        </h1>
        <p className="text-sm text-neutral-600">
          Pick a team to publish this dashboard to. Team members will see it
          on their dashboard list.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Publish to a team</CardTitle>
        </CardHeader>
        <CardContent>
          {teamList.length === 0 ? (
            <p
              className="text-sm text-muted-foreground"
              data-testid="dashboards-teams-no-teams"
            >
              No teams in this org yet. Create one at{" "}
              <Link
                href="/admin/allocation-rules"
                className="underline"
              >
                /admin/allocation-rules
              </Link>{" "}
              first.
            </p>
          ) : (
            <PublishToTeamForm dashboardId={id} teams={teamList} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Current publications</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {assignments.length === 0 ? (
            <p
              className="p-6 text-sm text-muted-foreground"
              data-testid="dashboards-teams-none"
            >
              Not published to any team yet.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {assignments.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center justify-between p-4"
                  data-testid={`assignment-${a.id}`}
                >
                  <div>
                    <p className="text-sm font-medium">
                      {a.team_name ?? a.team_id}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Published {new Date(a.published_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {a.is_default && (
                      <Badge variant="secondary">default</Badge>
                    )}
                    <RevokeButton
                      dashboardId={id}
                      assignmentId={a.id}
                      teamName={a.team_name ?? a.team_id}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
