"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { resolveForUser } from "@/lib/auth/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SearchLeadResult = {
  id: string;
  label: string;
  state: string;
  phone?: string;
};

export type SearchLeadsOk = { ok: true; results: SearchLeadResult[] };
export type SearchLeadsErr = {
  ok: false;
  error: "permission" | "validation" | "unknown";
  message?: string;
};
export type SearchLeadsResult = SearchLeadsOk | SearchLeadsErr;

const querySchema = z
  .string()
  .trim()
  .min(1, "Query must be at least 1 character")
  .max(80, "Query must be 80 characters or fewer");

const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 20;

/**
 * RLS-scoped fuzzy lookup over the user's tenant leads. Used by the
 * Cmd+K "Open lead by name…" sub-mode.
 *
 * Tenant-isolation contract: uses the request-scoped server client
 * (not service-role); RLS policies on `nodes` (D-001) drop rows whose
 * organization_id ≠ caller's `auth.app_org_id()` claim.
 *
 * No `read_sensitive` audit row — operational-tier read by the
 * workspace's own user (D-004.4 / D-006.4 precedent).
 */
export async function searchLeads(
  query: string,
  limit?: number,
  client?: SupabaseClient,
): Promise<SearchLeadsResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "permission" };
  const perms = resolveForUser(user);
  if (!perms.has("leads:view")) {
    return { ok: false, error: "permission" };
  }

  const parsed = querySchema.safeParse(query);
  if (!parsed.success) {
    return {
      ok: false,
      error: "validation",
      message: parsed.error.issues[0]?.message ?? "Invalid query",
    };
  }
  const trimmed = parsed.data;
  const cappedLimit = Math.max(1, Math.min(limit ?? DEFAULT_LIMIT, MAX_LIMIT));

  const supabase = client ?? (await createSupabaseServerClient());

  // ILIKE escaping: replace LIKE-special chars (% _) so user input is literal.
  const escaped = trimmed.replace(/[\\%_]/g, (m) => `\\${m}`);
  const pattern = `%${escaped}%`;

  const { data, error } = await supabase
    .from("nodes")
    .select("id, label, state, data")
    .eq("node_type", "lead")
    .is("deleted_at", null)
    .or(`label.ilike.${pattern},data->>phone.ilike.${pattern}`)
    .order("updated_at", { ascending: false })
    .limit(cappedLimit);

  if (error) {
    return { ok: false, error: "unknown", message: error.message };
  }

  const rows = (data ?? []) as Array<{
    id: string;
    label: string;
    state: string;
    data: { phone?: unknown } | null;
  }>;

  const results: SearchLeadResult[] = rows.map((row) => ({
    id: row.id,
    label: row.label,
    state: row.state,
    phone:
      row.data && typeof row.data.phone === "string"
        ? row.data.phone
        : undefined,
  }));

  return { ok: true, results };
}
