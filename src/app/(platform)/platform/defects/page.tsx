import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { listDefects } from "@/lib/platform/defects";
import { NewDefectForm } from "./new-form";

export const dynamic = "force-dynamic";

/**
 * D-606 — defect tracking module. List + create form on a single page;
 * detail view at /platform/defects/[id].
 */
export default async function DefectsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");
  if (user.profile.base_role !== "super_admin") redirect("/403");

  const rows = await listDefects({});

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Defects</h1>
        <p className="text-sm text-neutral-600">
          Operational incident tracker — record severity, status, and the
          audit rows that anchor the root-cause analysis.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Log a defect</CardTitle>
        </CardHeader>
        <CardContent>
          <NewDefectForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All defects</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <p
              className="p-6 text-sm text-muted-foreground"
              data-testid="defects-empty"
            >
              No defects logged.
            </p>
          ) : (
            <Table data-testid="defects-table">
              <TableHeader>
                <TableRow>
                  <TableHead>Severity</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Org</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((d) => (
                  <TableRow key={d.id} data-testid={`defect-row-${d.id}`}>
                    <TableCell>
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
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/platform/defects/${d.id}`}
                        className="font-medium underline hover:text-foreground"
                      >
                        {d.title}
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {d.organization_id?.slice(0, 8) ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {d.status.replace(/_/g, " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(d.created_at).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
