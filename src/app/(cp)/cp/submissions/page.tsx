import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { listCpSubmissions, type CpStatus } from "@/lib/cp/submission";

export const dynamic = "force-dynamic";

const STATUS_VARIANT: Record<
  CpStatus,
  "default" | "secondary" | "outline" | "destructive"
> = {
  pending: "secondary",
  accepted: "default",
  converted: "default",
  rejected: "destructive",
};

export default async function CpSubmissionsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");
  if (!user.org_id) redirect("/cp/submit");

  const isCp = user.profile.base_role === "channel_partner";
  const rows = isCp
    ? await listCpSubmissions(user.org_id, user.user.id)
    : [];

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">My submissions</h1>
        <p className="text-sm text-neutral-600">
          Last 50 leads submitted through the channel-partner portal. Status
          flips after the CP coordinator reviews.
        </p>
      </header>

      {!isCp && (
        <Card>
          <CardContent className="py-6 text-sm text-neutral-600">
            You&apos;re not signed in as a channel partner — this list is empty
            for non-CP roles.
          </CardContent>
        </Card>
      )}

      <div className="rounded-md border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Created</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Source property</TableHead>
              <TableHead>Budget</TableHead>
              <TableHead>Lead state</TableHead>
              <TableHead>CP status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-neutral-500 py-8 text-center text-sm"
                >
                  No submissions yet.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="text-xs text-neutral-600 whitespace-nowrap">
                  {new Date(r.created_at).toLocaleString()}
                </TableCell>
                <TableCell className="font-mono text-sm">{r.phone}</TableCell>
                <TableCell className="text-sm">
                  {r.source_property ?? "—"}
                </TableCell>
                <TableCell className="text-sm">
                  {r.expected_budget ?? "—"}
                </TableCell>
                <TableCell className="text-xs">
                  <Badge variant="outline">{r.state}</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[r.cp_status]}>
                    {r.cp_status}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
