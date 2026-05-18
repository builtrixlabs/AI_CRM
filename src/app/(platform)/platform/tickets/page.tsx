import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import {
  listTickets,
  type TicketStatus,
  isTicketStatus,
} from "@/lib/platform/tickets";

export const dynamic = "force-dynamic";

const STATUS_VARIANT: Record<
  TicketStatus,
  "default" | "secondary" | "outline" | "destructive"
> = {
  open: "destructive",
  responded: "secondary",
  closed: "outline",
};

const STATUS_FILTERS: Array<TicketStatus | "any"> = [
  "any",
  "open",
  "responded",
  "closed",
];

export default async function TicketsPage(props: {
  searchParams: Promise<{ status?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");
  if (user.profile.base_role !== "super_admin") redirect("/dashboard");

  const sp = await props.searchParams;
  const filter = isTicketStatus(sp.status) ? sp.status : null;

  const rows = await listTickets({ status: filter });
  const openCount = rows.filter((r) => r.status === "open").length;

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Tickets</h1>
          <p className="text-sm text-neutral-600">
            Platform support inbox. {openCount > 0 && (
              <span>
                <strong className="text-rose-700">{openCount} open</strong> awaiting
                response.
              </span>
            )}
          </p>
        </div>
        <nav className="flex items-center gap-1 text-xs">
          {STATUS_FILTERS.map((s) => (
            <Link
              key={s}
              href={s === "any" ? "/platform/tickets" : `/platform/tickets?status=${s}`}
              className={`px-2 py-1 rounded-md border ${
                (filter === null && s === "any") || filter === s
                  ? "bg-neutral-900 text-white border-neutral-900"
                  : "bg-white text-neutral-700 hover:bg-neutral-50"
              }`}
            >
              {s}
            </Link>
          ))}
        </nav>
      </header>

      <div className="rounded-md border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Created</TableHead>
              <TableHead>Org</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead>Kind</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-neutral-500 py-8 text-center"
                >
                  No tickets in this view.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="text-xs text-neutral-600 whitespace-nowrap">
                  {new Date(r.created_at).toLocaleString()}
                </TableCell>
                <TableCell className="text-sm">
                  {r.org_name ?? r.organization_id}
                  <span className="block text-xs text-neutral-500 font-mono">
                    {r.org_slug ?? ""}
                  </span>
                </TableCell>
                <TableCell className="font-medium">
                  <Link
                    href={`/platform/tickets/${r.id}`}
                    className="hover:underline"
                  >
                    {r.subject}
                  </Link>
                </TableCell>
                <TableCell className="text-xs text-neutral-600">
                  {r.kind ?? "—"}
                </TableCell>
                <TableCell className="text-xs capitalize">{r.priority}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[r.status]}>{r.status}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
