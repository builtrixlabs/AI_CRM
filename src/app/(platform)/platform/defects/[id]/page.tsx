import { notFound, redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { getDefect } from "@/lib/platform/defects";
import { DefectStatusControl } from "./status-control";

export const dynamic = "force-dynamic";

export default async function DefectDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");
  if (user.profile.base_role !== "super_admin") redirect("/403");

  const { id } = await props.params;
  const d = await getDefect(id);
  if (!d) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-1">
        <div className="flex items-center gap-3">
          <Badge
            variant={
              d.severity === "P0"
                ? "destructive"
                : d.severity === "P1"
                  ? "default"
                  : "secondary"
            }
          >
            {d.severity}
          </Badge>
          <Badge variant="outline">{d.status.replace(/_/g, " ")}</Badge>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{d.title}</h1>
        <p className="text-xs text-muted-foreground">
          Logged {new Date(d.created_at).toLocaleString()} ·{" "}
          {d.organization_id ?? "no org"}
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Description</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="whitespace-pre-wrap text-sm">{d.description}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Status</CardTitle>
        </CardHeader>
        <CardContent>
          <DefectStatusControl id={d.id} status={d.status} />
        </CardContent>
      </Card>

      {d.related_audit_ids.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Related audit rows</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 font-mono text-xs">
              {d.related_audit_ids.map((id) => (
                <li key={id}>{id}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
