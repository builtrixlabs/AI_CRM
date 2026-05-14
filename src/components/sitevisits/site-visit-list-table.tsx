import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { SiteVisitListRow } from "@/lib/sitevisits/list";
import type { SiteVisitState } from "@/lib/sitevisits/transitions";

const STATE_BADGE: Record<
  SiteVisitState,
  "default" | "secondary" | "outline" | "destructive"
> = {
  draft: "outline",
  scheduled: "secondary",
  confirmed: "default",
  in_progress: "default",
  completed: "secondary",
  cancelled: "outline",
  no_show: "destructive",
};

function fmtDateTime(iso: string | null, tz: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: tz,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

export function SiteVisitListTable({
  rows,
  tz = "Asia/Kolkata",
}: {
  rows: SiteVisitListRow[];
  tz?: string;
}) {
  if (rows.length === 0) {
    return (
      <div
        className="rounded-md border border-border bg-card p-8 text-center text-sm text-muted-foreground"
        data-testid="sv-list-empty"
      >
        No site visits match these filters.
      </div>
    );
  }
  return (
    <div className="rounded-md border border-border bg-card">
      <Table data-testid="sv-list-table">
        <TableHeader>
          <TableRow>
            <TableHead>Lead</TableHead>
            <TableHead>Scheduled</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Sales rep</TableHead>
            <TableHead>Coordinator</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id} data-testid={`sv-row-${r.id}`}>
              <TableCell>
                <Link
                  href={`/dashboard/site-visits/${r.id}`}
                  className="font-medium underline hover:text-foreground"
                >
                  {r.lead_label ?? r.lead_id ?? "—"}
                </Link>
              </TableCell>
              <TableCell>{fmtDateTime(r.scheduled_at, tz)}</TableCell>
              <TableCell>
                {r.state ? (
                  <Badge variant={STATE_BADGE[r.state]}>
                    {r.state.replace(/_/g, " ")}
                  </Badge>
                ) : (
                  "—"
                )}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {r.assigned_sales_rep_id ?? "Unassigned"}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {r.coordinator_id ?? "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
