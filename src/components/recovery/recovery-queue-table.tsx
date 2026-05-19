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
import { RecoveryClaimButton } from "./recovery-claim-button";
import { RecoveryResolveForm } from "./recovery-resolve-form";
import type {
  RecoveryQueueListRow,
  RecoveryReason,
} from "@/lib/recovery/types";

const REASON_LABEL: Record<RecoveryReason, string> = {
  lost: "Lost",
  on_hold: "On hold",
  stale_contacted: "Stale (contacted)",
  stale_qualified: "Stale (qualified)",
};

const REASON_VARIANT: Record<
  RecoveryReason,
  "default" | "secondary" | "outline" | "destructive"
> = {
  lost: "destructive",
  on_hold: "secondary",
  stale_contacted: "outline",
  stale_qualified: "outline",
};

function fmtTs(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

export function RecoveryQueueTable({
  rows,
  viewerId,
  canClaim,
  canResolve,
}: {
  rows: RecoveryQueueListRow[];
  viewerId: string;
  canClaim: boolean;
  canResolve: boolean;
}) {
  if (rows.length === 0) {
    return (
      <div
        className="rounded-md border border-border bg-card p-8 text-center text-sm text-muted-foreground"
        data-testid="recovery-list-empty"
      >
        No recovery items match these filters.
      </div>
    );
  }
  return (
    <div className="rounded-md border border-border bg-card">
      <Table data-testid="recovery-list-table">
        <TableHeader>
          <TableRow>
            <TableHead>Lead</TableHead>
            <TableHead>Reason</TableHead>
            <TableHead>Added</TableHead>
            <TableHead>Claimed by</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const claimedBySelf = r.claimed_by === viewerId;
            const resolved = Boolean(r.resolved_at);
            return (
              <TableRow key={r.id} data-testid={`recovery-row-${r.id}`}>
                <TableCell>
                  <Link
                    href={`/dashboard/leads/${r.lead_id}`}
                    className="font-medium underline hover:text-foreground"
                  >
                    {r.lead_label ?? r.lead_id}
                  </Link>
                  {r.lead_state && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      ({r.lead_state})
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant={REASON_VARIANT[r.recovery_reason]}>
                    {REASON_LABEL[r.recovery_reason]}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {fmtTs(r.added_at)}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {r.claimed_by
                    ? claimedBySelf
                      ? "You"
                      : r.claimed_by
                    : "—"}
                </TableCell>
                <TableCell>
                  {resolved ? (
                    <Badge variant="secondary">
                      {r.resolution?.replace(/_/g, " ") ?? "resolved"}
                    </Badge>
                  ) : r.claimed_by ? (
                    <Badge variant="default">in progress</Badge>
                  ) : (
                    <Badge variant="outline">open</Badge>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-2">
                    {!resolved && !r.claimed_by && (
                      <RecoveryClaimButton
                        queueId={r.id}
                        disabled={!canClaim}
                      />
                    )}
                    {!resolved && r.claimed_by && (
                      <RecoveryResolveForm
                        queueId={r.id}
                        disabled={!canResolve || (!claimedBySelf && !canResolve)}
                      />
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
