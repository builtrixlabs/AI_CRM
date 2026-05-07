import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { recentAuditRows } from "@/lib/platform/queries";

export const dynamic = "force-dynamic";

export default async function PlatformAuditPage(props: {
  searchParams: Promise<{
    organization_id?: string;
    action?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");

  const sp = await props.searchParams;

  const rows = await recentAuditRows(
    {
      organization_id: sp.organization_id || null,
      action: sp.action || null,
      from_ts: sp.from || null,
      to_ts: sp.to || null,
    },
    500,
    user.user.id
  );

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Audit log</h1>
        <p className="text-sm text-neutral-600">
          500 most-recent audit rows. Constitution IV — append-only, immutable.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            action="/platform/audit"
            className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end"
          >
            <div>
              <Label htmlFor="organization_id">Organization ID</Label>
              <Input
                id="organization_id"
                name="organization_id"
                placeholder="uuid"
                defaultValue={sp.organization_id ?? ""}
              />
            </div>
            <div>
              <Label htmlFor="action">Action</Label>
              <Input
                id="action"
                name="action"
                placeholder="create_organization, node_create, …"
                defaultValue={sp.action ?? ""}
              />
            </div>
            <div>
              <Label htmlFor="from">From</Label>
              <Input id="from" name="from" type="date" defaultValue={sp.from ?? ""} />
            </div>
            <div>
              <Label htmlFor="to">To</Label>
              <Input id="to" name="to" type="date" defaultValue={sp.to ?? ""} />
            </div>
            <Button type="submit" className="sm:col-span-1">
              Filter
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="rounded-md border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Time</TableHead>
              <TableHead>Organization</TableHead>
              <TableHead>Actor role</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Table</TableHead>
              <TableHead>Record</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-neutral-500 py-8 text-center">
                  No matching rows.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-sm">
                  {new Date(r.ts).toLocaleString()}
                </TableCell>
                <TableCell className="font-mono text-xs text-neutral-600">
                  {r.organization_id?.slice(0, 8) ?? "—"}
                </TableCell>
                <TableCell>{r.actor_role}</TableCell>
                <TableCell className="font-mono text-sm">{r.action}</TableCell>
                <TableCell className="text-sm">{r.table_name}</TableCell>
                <TableCell className="font-mono text-xs text-neutral-500">
                  {r.record_id?.slice(0, 8) ?? "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
