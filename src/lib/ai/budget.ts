import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * V0 hardcoded global cap. D-014 wires plan-tier-driven defaults.
 * Documented in baseline 115. To raise for a specific pilot, add a
 * per-org override column in a follow-up directive.
 */
export const MONTHLY_TOKEN_CAP = 100_000;
export const SOFT_WARN_RATIO = 0.8;

export type BudgetCheck =
  | { kind: "ok" }
  | { kind: "warn"; ratio: number; used: number; cap: number }
  | { kind: "exceeded"; used: number; cap: number };

/** Inclusive UTC start of the current calendar month. */
function startOfCurrentMonthUTC(now = new Date()): string {
  const utc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0),
  );
  return utc.toISOString();
}

/**
 * SUM(tokens_in + tokens_out) for the org's current calendar month.
 * Includes both `ok` and `error` rows so a budget-exceeded run can't
 * be hidden by recording the call as failed.
 */
export async function currentMonthTokens(
  organization_id: string,
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<number> {
  const since = startOfCurrentMonthUTC();
  const { data, error } = await client
    .from("token_usage_ledger")
    .select("tokens_in, tokens_out")
    .eq("organization_id", organization_id)
    .gte("ts", since);
  if (error) throw error;
  const rows = (data ?? []) as Array<{ tokens_in: number; tokens_out: number }>;
  let sum = 0;
  for (const row of rows) {
    sum += (row.tokens_in ?? 0) + (row.tokens_out ?? 0);
  }
  return sum;
}

/**
 * Pre-call check. Returns 'exceeded' WITHOUT incrementing — the
 * gateway should not call the provider; instead it should record the
 * rejected call to the ledger as `status='error', error_code='budget'`.
 *
 * `estimated_tokens` is the gateway's best guess at upper-bound cost
 * for the upcoming call (e.g. max_tokens + a heuristic for prompt size).
 */
export async function checkBudget(
  organization_id: string,
  estimated_tokens: number,
  client?: SupabaseClient,
): Promise<BudgetCheck> {
  const used = await currentMonthTokens(organization_id, client);
  const projected = used + Math.max(0, estimated_tokens);
  if (projected >= MONTHLY_TOKEN_CAP) {
    return { kind: "exceeded", used, cap: MONTHLY_TOKEN_CAP };
  }
  if (projected >= MONTHLY_TOKEN_CAP * SOFT_WARN_RATIO) {
    return {
      kind: "warn",
      ratio: projected / MONTHLY_TOKEN_CAP,
      used,
      cap: MONTHLY_TOKEN_CAP,
    };
  }
  return { kind: "ok" };
}

export class TokenBudgetExceededError extends Error {
  constructor(
    public readonly organization_id: string,
    public readonly used: number,
    public readonly cap: number,
  ) {
    super(
      `TokenBudgetExceededError: org=${organization_id} used=${used} cap=${cap}`,
    );
    this.name = "TokenBudgetExceededError";
  }
}
