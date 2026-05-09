import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { getTicket, type TicketStatus } from "@/lib/platform/tickets";
import { ReplyForm, StatusControl } from "../ticket-thread";

export const dynamic = "force-dynamic";

const STATUS_VARIANT: Record<
  TicketStatus,
  "default" | "secondary" | "outline" | "destructive"
> = {
  open: "destructive",
  responded: "secondary",
  closed: "outline",
};

export default async function TicketDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");
  if (user.profile.base_role !== "super_admin") redirect("/dashboard");

  const { id } = await props.params;
  const t = await getTicket(id);
  if (!t) notFound();

  return (
    <div className="space-y-6 max-w-3xl">
      <Link
        href="/platform/tickets"
        className="text-sm text-neutral-600 hover:underline"
      >
        ← All tickets
      </Link>

      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">{t.subject}</h1>
        <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-600">
          <span>
            From{" "}
            <Link
              href={`/platform/organizations/${t.organization_id}`}
              className="font-mono hover:underline"
            >
              {t.org_name ?? t.organization_id}
            </Link>
          </span>
          <span>·</span>
          <Badge variant={STATUS_VARIANT[t.status]}>{t.status}</Badge>
          <span>·</span>
          <span className="capitalize">{t.priority} priority</span>
          {t.kind && (
            <>
              <span>·</span>
              <Badge variant="outline" className="font-mono text-[10px]">
                {t.kind}
              </Badge>
            </>
          )}
          <span>·</span>
          <span>{new Date(t.created_at).toLocaleString()}</span>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Original message</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="whitespace-pre-wrap text-sm">{t.body}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Replies ({t.replies.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {t.replies.length === 0 ? (
            <p className="text-sm text-neutral-500">
              No replies yet — send the first one below.
            </p>
          ) : (
            <ul className="space-y-3">
              {t.replies.map((r, i) => (
                <li key={i} className="rounded-md border bg-neutral-50 p-3">
                  <p className="whitespace-pre-wrap text-sm">{r.body}</p>
                  <p className="pt-2 text-[10px] uppercase tracking-wide text-neutral-500">
                    {new Date(r.sent_at).toLocaleString()}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Status control</CardTitle>
        </CardHeader>
        <CardContent>
          <StatusControl ticket_id={t.id} current_status={t.status} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Reply</CardTitle>
        </CardHeader>
        <CardContent>
          <ReplyForm ticket_id={t.id} current_status={t.status} />
        </CardContent>
      </Card>
    </div>
  );
}
