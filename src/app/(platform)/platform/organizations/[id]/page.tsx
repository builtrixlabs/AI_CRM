import { notFound, redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { getOrgDetail } from "@/lib/platform/queries";

export const dynamic = "force-dynamic";

export default async function OrgDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");

  const { id } = await props.params;
  const detail = await getOrgDetail(id, user.user.id);
  if (!detail) notFound();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{detail.name}</h1>
        <p className="text-sm text-neutral-600 font-mono">{detail.slug}</p>
      </header>

      {/* Section 1 — Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Organization info</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <dt className="text-neutral-500">Plan tier</dt>
            <dd>
              <Badge variant="secondary" className="capitalize">
                {detail.plan_tier}
              </Badge>
            </dd>

            <dt className="text-neutral-500">Created</dt>
            <dd>{new Date(detail.created_at).toLocaleString()}</dd>

            <dt className="text-neutral-500">GSTIN</dt>
            <dd>{detail.gstin ?? "—"}</dd>

            <dt className="text-neutral-500">Primary contact email</dt>
            <dd>{detail.primary_contact_email ?? "—"}</dd>
          </dl>
        </CardContent>
      </Card>

      {/* Section 2 — Admins */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Admins</CardTitle>
        </CardHeader>
        <CardContent>
          {detail.admins.length === 0 ? (
            <p className="text-neutral-500 text-sm">No org admins yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Display name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.admins.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-mono text-sm">{a.email}</TableCell>
                    <TableCell>{a.display_name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{a.base_role}</Badge>
                    </TableCell>
                    <TableCell className="text-neutral-500 text-sm">
                      {new Date(a.created_at).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Section 3 — Subscription */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Subscription</CardTitle>
        </CardHeader>
        <CardContent>
          {detail.subscription ? (
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <dt className="text-neutral-500">Plan</dt>
              <dd className="capitalize">{detail.subscription.plan_tier}</dd>
              <dt className="text-neutral-500">Status</dt>
              <dd>
                <Badge variant="secondary" className="capitalize">
                  {detail.subscription.status}
                </Badge>
              </dd>
              <dt className="text-neutral-500">Started</dt>
              <dd>{new Date(detail.subscription.starts_at).toLocaleDateString()}</dd>
              <dt className="text-neutral-500">Renewal</dt>
              <dd>
                {detail.subscription.current_period_end
                  ? new Date(detail.subscription.current_period_end).toLocaleDateString()
                  : "—"}
              </dd>
            </dl>
          ) : (
            <p className="text-neutral-500 text-sm">No subscription on file.</p>
          )}
        </CardContent>
      </Card>

      {/* Section 4 — Recent audit (last 50) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent audit (last 50)</CardTitle>
        </CardHeader>
        <CardContent>
          {detail.recent_audit.length === 0 ? (
            <p className="text-neutral-500 text-sm">No audit rows yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Actor role</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Table</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.recent_audit.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="text-neutral-600 text-sm font-mono">
                      {new Date(row.ts).toLocaleString()}
                    </TableCell>
                    <TableCell>{row.actor_role}</TableCell>
                    <TableCell className="font-mono text-sm">{row.action}</TableCell>
                    <TableCell className="text-neutral-500 text-sm">
                      {row.table_name}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Separator />

      <p className="text-xs text-neutral-500">
        Operational data (leads, deals, contacts) is never readable from this
        surface. Constitution Principle II.
      </p>
    </div>
  );
}
