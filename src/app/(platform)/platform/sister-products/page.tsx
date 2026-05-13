import Link from "next/link";
import { redirect } from "next/navigation";
import { Boxes } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { listTokens } from "@/lib/integrations/sister-products/token";
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
import { IssueTokenForm } from "./issue-form";
import { RevokeButton } from "./revoke-button";

export const dynamic = "force-dynamic";

type OrgRow = { id: string; name: string };

export default async function SisterProductsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");
  if (user.profile.base_role !== "super_admin") redirect("/dashboard");

  const admin = getSupabaseAdmin();
  const [tokens, { data: orgs }] = await Promise.all([
    listTokens(admin),
    admin.from("organizations").select("id, name").order("name"),
  ]);
  const orgsList = (orgs ?? []) as OrgRow[];
  const orgById = new Map(orgsList.map((o) => [o.id, o.name]));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Boxes className="h-5 w-5 text-neutral-500" /> Sister-product API tokens
        </h1>
        <p className="text-sm text-neutral-600">
          Per-org bearer tokens scoped to a single product kind. Each token
          is issued once, stored as a SHA-256 hash, and used by sister
          products to authenticate against{" "}
          <code className="font-mono">/api/sister/v1/*</code> (D-441) and{" "}
          <code className="font-mono">/api/sister/events</code> (D-442 / D-443).
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Issue a new token</CardTitle>
          <p className="text-xs text-neutral-500">
            The plaintext token is shown once on this page after issuance.
            Copy it immediately; it can&apos;t be retrieved later.
          </p>
        </CardHeader>
        <CardContent>
          <IssueTokenForm orgs={orgsList} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All issued tokens</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Org</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Last 4</TableHead>
                <TableHead>Issued</TableHead>
                <TableHead>Last used</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tokens.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="py-8 text-center text-sm text-neutral-500"
                  >
                    No tokens issued yet. Issue one above.
                  </TableCell>
                </TableRow>
              )}
              {tokens.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/platform/organizations/${t.organization_id}`}
                      className="hover:underline"
                    >
                      {orgById.get(t.organization_id) ?? t.organization_id}
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {t.product_kind}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    ····{t.last4}
                  </TableCell>
                  <TableCell className="text-xs text-neutral-600">
                    {new Date(t.created_at).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-xs text-neutral-600">
                    {t.last_used_at
                      ? new Date(t.last_used_at).toLocaleString()
                      : "—"}
                  </TableCell>
                  <TableCell>
                    {t.revoked_at ? (
                      <Badge variant="outline">Revoked</Badge>
                    ) : (
                      <Badge>Active</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {t.revoked_at ? null : <RevokeButton id={t.id} />}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
