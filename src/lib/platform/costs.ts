import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type CallCategory = "voice_iq_inbox" | "voice_iq_lookup" | "other";

export type OrgCostRow = {
  organization_id: string;
  slug: string;
  name: string;
  plan_tier: string;
  tokens_in_30d: number;
  tokens_out_30d: number;
  api_calls_30d: number;
  /** D-312 — per-route cost categorization. */
  calls_voice_iq_inbox_30d: number;
  calls_voice_iq_lookup_30d: number;
  calls_other_30d: number;
};

export type CostsTotals = {
  total_orgs: number;
  total_tokens_in_30d: number;
  total_tokens_out_30d: number;
  total_api_calls_30d: number;
  total_voice_iq_inbox_30d: number;
  total_voice_iq_lookup_30d: number;
  total_other_30d: number;
};

/** D-312 — bucket an api_audit_log path string into one of 3 cost
 * categories. Inbox vs lookup vs everything else. Operator can extend
 * the rules in V3.x if more product surfaces matter for cost forecasting. */
export function categorizePath(path: string | null | undefined): CallCategory {
  if (!path) return "other";
  if (path.startsWith("/api/events/inbox")) return "voice_iq_inbox";
  if (path.startsWith("/api/admin/leads/lookup")) return "voice_iq_lookup";
  return "other";
}

export type CostsSummary = {
  rows: OrgCostRow[];
  totals: CostsTotals;
};

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export async function getOrgCosts(
  client: SupabaseClient = getSupabaseAdmin()
): Promise<CostsSummary> {
  const since = new Date(Date.now() - THIRTY_DAYS_MS).toISOString();

  const orgsRes = await client
    .from("organizations")
    .select("id, slug, name, plan_tier")
    .is("deleted_at", null)
    .order("name", { ascending: true });
  if (orgsRes.error || !orgsRes.data) {
    return { rows: [], totals: emptyTotals() };
  }

  const tokensRes = await client
    .from("token_usage_ledger")
    .select("organization_id, tokens_in, tokens_out")
    .gte("ts", since);
  const apiCallsRes = await client
    .from("api_audit_log")
    .select("organization_id, path")
    .gte("ts", since);

  const tokensByOrg = new Map<string, { in: number; out: number }>();
  if (!tokensRes.error && tokensRes.data) {
    for (const r of tokensRes.data as Array<{
      organization_id: string | null;
      tokens_in: number | null;
      tokens_out: number | null;
    }>) {
      if (!r.organization_id) continue;
      const cur = tokensByOrg.get(r.organization_id) ?? { in: 0, out: 0 };
      cur.in += r.tokens_in ?? 0;
      cur.out += r.tokens_out ?? 0;
      tokensByOrg.set(r.organization_id, cur);
    }
  }

  const callsByOrg = new Map<string, number>();
  const inboxByOrg = new Map<string, number>();
  const lookupByOrg = new Map<string, number>();
  const otherByOrg = new Map<string, number>();
  if (!apiCallsRes.error && apiCallsRes.data) {
    for (const r of apiCallsRes.data as Array<{
      organization_id: string | null;
      path: string | null;
    }>) {
      if (!r.organization_id) continue;
      callsByOrg.set(
        r.organization_id,
        (callsByOrg.get(r.organization_id) ?? 0) + 1
      );
      const cat = categorizePath(r.path);
      const target =
        cat === "voice_iq_inbox"
          ? inboxByOrg
          : cat === "voice_iq_lookup"
            ? lookupByOrg
            : otherByOrg;
      target.set(r.organization_id, (target.get(r.organization_id) ?? 0) + 1);
    }
  }

  const rows: OrgCostRow[] = (
    orgsRes.data as Array<{
      id: string;
      slug: string;
      name: string;
      plan_tier: string;
    }>
  ).map((o) => {
    const tokens = tokensByOrg.get(o.id) ?? { in: 0, out: 0 };
    const calls = callsByOrg.get(o.id) ?? 0;
    return {
      organization_id: o.id,
      slug: o.slug,
      name: o.name,
      plan_tier: o.plan_tier,
      tokens_in_30d: tokens.in,
      tokens_out_30d: tokens.out,
      api_calls_30d: calls,
      calls_voice_iq_inbox_30d: inboxByOrg.get(o.id) ?? 0,
      calls_voice_iq_lookup_30d: lookupByOrg.get(o.id) ?? 0,
      calls_other_30d: otherByOrg.get(o.id) ?? 0,
    };
  });

  const totals: CostsTotals = {
    total_orgs: rows.length,
    total_tokens_in_30d: rows.reduce((s, r) => s + r.tokens_in_30d, 0),
    total_tokens_out_30d: rows.reduce((s, r) => s + r.tokens_out_30d, 0),
    total_api_calls_30d: rows.reduce((s, r) => s + r.api_calls_30d, 0),
    total_voice_iq_inbox_30d: rows.reduce(
      (s, r) => s + r.calls_voice_iq_inbox_30d,
      0
    ),
    total_voice_iq_lookup_30d: rows.reduce(
      (s, r) => s + r.calls_voice_iq_lookup_30d,
      0
    ),
    total_other_30d: rows.reduce((s, r) => s + r.calls_other_30d, 0),
  };

  return { rows, totals };
}

function emptyTotals(): CostsTotals {
  return {
    total_orgs: 0,
    total_tokens_in_30d: 0,
    total_tokens_out_30d: 0,
    total_api_calls_30d: 0,
    total_voice_iq_inbox_30d: 0,
    total_voice_iq_lookup_30d: 0,
    total_other_30d: 0,
  };
}
