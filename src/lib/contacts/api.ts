import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * D-410 — contact canvas + list helpers.
 *
 * Contacts live in the `nodes` table with `node_type='contact'` (D-002).
 * No state machine — contact is the buyer master. Custom fields integrate
 * via D-020. Linked entities (leads, deals, activities, site_visits) come
 * from the `edges` table by partitioning neighbours.
 */

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const contactDataSchema = z
  .object({
    email: z.string().email().nullable().optional(),
    phone: z.string().min(1).max(40).nullable().optional(),
    primary_address: z.string().max(400).nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
  })
  .passthrough();

export type ContactHeader = {
  id: string;
  organization_id: string;
  workspace_id: string;
  label: string;
  email: string | null;
  phone: string | null;
  primary_address: string | null;
  notes: string | null;
  data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type ContactLinkedLead = {
  id: string;
  label: string;
  state: string | null;
};

export type ContactLinkedDeal = {
  id: string;
  label: string;
  stage: string | null;
};

export type ContactLinkedSiteVisit = {
  id: string;
  label: string;
  state: string | null;
};

export type ContactActivity = {
  id: string;
  label: string;
  created_at: string;
  created_by: string;
  created_via: string;
  ai_confidence: number | null;
};

export type ContactCanvas = {
  contact: ContactHeader;
  leads: ContactLinkedLead[];
  deals: ContactLinkedDeal[];
  site_visits: ContactLinkedSiteVisit[];
  activities: ContactActivity[];
};

export async function getContactCanvas(
  contact_id: string,
  caller_org_id: string,
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<ContactCanvas | null> {
  if (!UUID_RE.test(contact_id)) return null;

  const { data: row, error } = await client
    .from("nodes")
    .select(
      "id, organization_id, workspace_id, label, data, created_at, updated_at",
    )
    .eq("id", contact_id)
    .eq("node_type", "contact")
    .eq("organization_id", caller_org_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !row) return null;

  const r = row as {
    id: string;
    organization_id: string;
    workspace_id: string;
    label: string;
    data: unknown;
    created_at: string;
    updated_at: string;
  };

  const parsedData = contactDataSchema.safeParse(r.data ?? {});
  const dataObj = parsedData.success
    ? (parsedData.data as Record<string, unknown>)
    : ((r.data as Record<string, unknown> | null) ?? {});

  const contact: ContactHeader = {
    id: r.id,
    organization_id: r.organization_id,
    workspace_id: r.workspace_id,
    label: r.label,
    email: typeof dataObj.email === "string" ? (dataObj.email as string) : null,
    phone: typeof dataObj.phone === "string" ? (dataObj.phone as string) : null,
    primary_address:
      typeof dataObj.primary_address === "string"
        ? (dataObj.primary_address as string)
        : null,
    notes:
      typeof dataObj.notes === "string" ? (dataObj.notes as string) : null,
    data: dataObj,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };

  // Partition neighbours by node_type via edges table.
  const { data: edges } = await client
    .from("edges")
    .select("from_node_id, to_node_id")
    .or(`from_node_id.eq.${contact_id},to_node_id.eq.${contact_id}`)
    .is("deleted_at", null);

  const neighbourIds = new Set<string>();
  for (const e of (edges ?? []) as Array<{
    from_node_id: string;
    to_node_id: string;
  }>) {
    const other = e.from_node_id === contact_id ? e.to_node_id : e.from_node_id;
    if (other && other !== contact_id) neighbourIds.add(other);
  }

  const leads: ContactLinkedLead[] = [];
  const deals: ContactLinkedDeal[] = [];
  const site_visits: ContactLinkedSiteVisit[] = [];
  const activities: ContactActivity[] = [];

  if (neighbourIds.size > 0) {
    const { data: nodes } = await client
      .from("nodes")
      .select(
        "id, node_type, label, state, data, created_at, created_by, created_via, ai_confidence, organization_id",
      )
      .in("id", Array.from(neighbourIds))
      .eq("organization_id", caller_org_id)
      .is("deleted_at", null);

    for (const n of (nodes ?? []) as Array<{
      id: string;
      node_type: string;
      label: string;
      state: string | null;
      data: Record<string, unknown> | null;
      created_at: string;
      created_by: string;
      created_via: string;
      ai_confidence: number | null;
    }>) {
      if (n.node_type === "lead") {
        leads.push({ id: n.id, label: n.label, state: n.state });
      } else if (n.node_type === "deal") {
        deals.push({ id: n.id, label: n.label, stage: n.state });
      } else if (n.node_type === "site_visit") {
        site_visits.push({ id: n.id, label: n.label, state: n.state });
      } else if (n.node_type === "activity") {
        activities.push({
          id: n.id,
          label: n.label,
          created_at: n.created_at,
          created_by: n.created_by,
          created_via: n.created_via,
          ai_confidence: n.ai_confidence,
        });
      }
    }
  }

  leads.sort((a, b) => a.label.localeCompare(b.label));
  deals.sort((a, b) => a.label.localeCompare(b.label));
  site_visits.sort((a, b) => a.label.localeCompare(b.label));
  activities.sort((a, b) =>
    a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0,
  );

  return { contact, leads, deals, site_visits, activities };
}

export type ContactListRow = {
  id: string;
  label: string;
  email: string | null;
  phone: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Lightweight list helper for cases where the D-413 views engine is not used
 * (e.g. internal scripts). Production list rendering uses
 * `listNodesByView({ entity_type: 'contact' })` from `src/lib/views/query.ts`.
 */
export async function listContacts(
  args: {
    organization_id: string;
    workspace_ids?: string[];
    limit?: number;
  },
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<ContactListRow[]> {
  let q = client
    .from("nodes")
    .select("id, label, data, created_at, updated_at")
    .eq("organization_id", args.organization_id)
    .eq("node_type", "contact")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (args.workspace_ids && args.workspace_ids.length > 0) {
    q = q.in("workspace_id", args.workspace_ids);
  }
  if (args.limit && args.limit > 0) {
    q = q.limit(args.limit);
  }
  const { data, error } = await q;
  if (error || !data) return [];
  return (data as Array<{
    id: string;
    label: string;
    data: Record<string, unknown> | null;
    created_at: string;
    updated_at: string;
  }>).map((r) => ({
    id: r.id,
    label: r.label,
    email: (r.data?.email as string | null | undefined) ?? null,
    phone: (r.data?.phone as string | null | undefined) ?? null,
    created_at: r.created_at,
    updated_at: r.updated_at,
  }));
}
