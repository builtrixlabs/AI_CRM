import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type TicketStatus = "open" | "responded" | "closed";

export type TicketReply = {
  body: string;
  sent_by: string;
  sent_at: string;
};

export type TicketRow = {
  id: string;
  organization_id: string;
  subject: string;
  status: TicketStatus;
  priority: string;
  kind: string | null;
  created_at: string;
  org_name: string | null;
  org_slug: string | null;
};

export type TicketDetail = TicketRow & {
  body: string;
  raised_by: string;
  replies: TicketReply[];
};

const STATUSES: ReadonlyArray<TicketStatus> = ["open", "responded", "closed"];

export function isTicketStatus(s: unknown): s is TicketStatus {
  return typeof s === "string" && (STATUSES as ReadonlyArray<string>).includes(s);
}

export type ListFilters = {
  status?: TicketStatus | null;
};

export async function listTickets(
  filters: ListFilters = {},
  client: SupabaseClient = getSupabaseAdmin()
): Promise<TicketRow[]> {
  let q = client
    .from("support_tickets")
    .select(
      "id, organization_id, subject, status, priority, kind, created_at"
    )
    .is("deleted_at", null);
  if (filters.status) q = q.eq("status", filters.status);
  const ticketsRes = await q
    .order("created_at", { ascending: false })
    .limit(200);
  if (ticketsRes.error || !ticketsRes.data) return [];

  const tickets = ticketsRes.data as Array<{
    id: string;
    organization_id: string;
    subject: string;
    status: string;
    priority: string;
    kind: string | null;
    created_at: string;
  }>;

  // Pull org names in one shot.
  const orgIds = Array.from(new Set(tickets.map((t) => t.organization_id)));
  const orgsRes = orgIds.length === 0
    ? { data: [] as Array<{ id: string; name: string; slug: string }>, error: null }
    : await client
        .from("organizations")
        .select("id, name, slug")
        .in("id", orgIds);

  const orgById = new Map<string, { name: string; slug: string }>();
  if (!orgsRes.error && orgsRes.data) {
    for (const o of orgsRes.data as Array<{
      id: string;
      name: string;
      slug: string;
    }>) {
      orgById.set(o.id, { name: o.name, slug: o.slug });
    }
  }

  return tickets.map((t) => ({
    id: t.id,
    organization_id: t.organization_id,
    subject: t.subject,
    status: isTicketStatus(t.status) ? t.status : "open",
    priority: t.priority,
    kind: t.kind,
    created_at: t.created_at,
    org_name: orgById.get(t.organization_id)?.name ?? null,
    org_slug: orgById.get(t.organization_id)?.slug ?? null,
  }));
}

export async function getTicket(
  ticket_id: string,
  client: SupabaseClient = getSupabaseAdmin()
): Promise<TicketDetail | null> {
  const { data, error } = await client
    .from("support_tickets")
    .select(
      "id, organization_id, raised_by, subject, body, status, priority, kind, replies, created_at"
    )
    .eq("id", ticket_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !data) return null;
  const t = data as {
    id: string;
    organization_id: string;
    raised_by: string;
    subject: string;
    body: string;
    status: string;
    priority: string;
    kind: string | null;
    replies: TicketReply[] | null;
    created_at: string;
  };

  const orgRes = await client
    .from("organizations")
    .select("name, slug")
    .eq("id", t.organization_id)
    .maybeSingle();
  const org = orgRes.data as { name: string; slug: string } | null;

  return {
    id: t.id,
    organization_id: t.organization_id,
    raised_by: t.raised_by,
    subject: t.subject,
    body: t.body,
    status: isTicketStatus(t.status) ? t.status : "open",
    priority: t.priority,
    kind: t.kind,
    replies: Array.isArray(t.replies) ? t.replies : [],
    created_at: t.created_at,
    org_name: org?.name ?? null,
    org_slug: org?.slug ?? null,
  };
}

export type WriteResult = { ok: true } | { ok: false; error: string };

export async function replyToTicket(
  ticket_id: string,
  body: string,
  actor_id: string,
  client: SupabaseClient = getSupabaseAdmin()
): Promise<WriteResult> {
  if (!body || body.trim().length < 2) {
    return { ok: false, error: "body_required" };
  }
  const t = await getTicket(ticket_id, client);
  if (!t) return { ok: false, error: "not_found" };

  const newReply: TicketReply = {
    body: body.trim(),
    sent_by: actor_id,
    sent_at: new Date().toISOString(),
  };
  const nextReplies = [...t.replies, newReply];
  const nextStatus: TicketStatus = t.status === "open" ? "responded" : t.status;

  const { error } = await client
    .from("support_tickets")
    .update({
      replies: nextReplies,
      status: nextStatus,
      updated_at: new Date().toISOString(),
      updated_by: actor_id,
      updated_via: "manual",
    })
    .eq("id", ticket_id);
  if (error) return { ok: false, error: error.message };

  await client.from("audit_log").insert({
    actor_id,
    actor_type: "user",
    actor_role: "super_admin",
    organization_id: t.organization_id,
    workspace_id: null,
    table_name: "support_tickets",
    record_id: ticket_id,
    action: "ticket_replied",
    diff: { from_status: t.status, to_status: nextStatus, reply_length: body.trim().length },
  });
  return { ok: true };
}

export async function setTicketStatus(
  ticket_id: string,
  status: TicketStatus,
  actor_id: string,
  client: SupabaseClient = getSupabaseAdmin()
): Promise<WriteResult> {
  if (!isTicketStatus(status)) return { ok: false, error: "invalid_status" };
  const t = await getTicket(ticket_id, client);
  if (!t) return { ok: false, error: "not_found" };
  if (t.status === status) return { ok: true };
  const { error } = await client
    .from("support_tickets")
    .update({
      status,
      updated_at: new Date().toISOString(),
      updated_by: actor_id,
      updated_via: "manual",
    })
    .eq("id", ticket_id);
  if (error) return { ok: false, error: error.message };
  await client.from("audit_log").insert({
    actor_id,
    actor_type: "user",
    actor_role: "super_admin",
    organization_id: t.organization_id,
    workspace_id: null,
    table_name: "support_tickets",
    record_id: ticket_id,
    action: "ticket_status_changed",
    diff: { from: t.status, to: status },
  });
  return { ok: true };
}
