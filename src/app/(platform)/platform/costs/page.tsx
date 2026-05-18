import { redirect } from "next/navigation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { getOrgCosts } from "@/lib/platform/costs";

export const dynamic = "force-dynamic";

const fmt = new Intl.NumberFormat("en-US");

export default async function CostsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");
  if (user.profile.base_role !== "super_admin") redirect("/dashboard");

  const { rows, totals } = await getOrgCosts();

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Costs</h1>
        <p className="text-sm text-neutral-600">
          Per-org × per-route 30-day rollup. D-312 categorizes calls into
          Voice IQ inbox / Voice IQ lookup / other so workload-mix shifts
          are visible.
        </p>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard label="Orgs" value={totals.total_orgs} />
        <SummaryCard label="Total API calls (30d)" value={totals.total_api_calls_30d} />
        <SummaryCard label="Voice IQ inbox" value={totals.total_voice_iq_inbox_30d} />
        <SummaryCard label="Voice IQ lookup" value={totals.total_voice_iq_lookup_30d} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Per-org breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Org</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead className="text-right">Tokens in</TableHead>
                <TableHead className="text-right">Tokens out</TableHead>
                <TableHead className="text-right">All calls</TableHead>
                <TableHead className="text-right">Inbox</TableHead>
                <TableHead className="text-right">Lookup</TableHead>
                <TableHead className="text-right">Other</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="text-sm text-neutral-500 text-center py-8"
                  >
                    No org cost data in the last 30 days.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((r) => (
                <TableRow key={r.organization_id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="capitalize text-neutral-600 text-xs">
                    {r.plan_tier}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {fmt.format(r.tokens_in_30d)}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {fmt.format(r.tokens_out_30d)}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {fmt.format(r.api_calls_30d)}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums text-emerald-700">
                    {fmt.format(r.calls_voice_iq_inbox_30d)}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums text-blue-700">
                    {fmt.format(r.calls_voice_iq_lookup_30d)}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums text-neutral-500">
                    {fmt.format(r.calls_other_30d)}
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

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="pt-4">
        <p className="text-xs text-neutral-500">{label}</p>
        <p className="text-2xl font-semibold tabular-nums">
          {fmt.format(value)}
        </p>
      </CardContent>
    </Card>
  );
}
