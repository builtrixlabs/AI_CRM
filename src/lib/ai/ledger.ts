import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type LedgerCallKind = "complete" | "embed";
export type LedgerStatus = "ok" | "error";

export type RecordCallInput = {
  organization_id: string | null;
  agent_id?: string | null;
  request_id: string;
  model_used: string;
  call_kind: LedgerCallKind;
  tokens_in: number;
  tokens_out: number;
  duration_ms?: number | null;
  status: LedgerStatus;
  error_code?: string | null;
};

/**
 * Append one row to `token_usage_ledger`. Service-role only; the
 * table is append-only (D-001.10 trigger pattern). Failures here are
 * THROWN — the gateway must surface ledger failures so we don't
 * silently lose accountability.
 */
export async function recordCall(
  input: RecordCallInput,
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<void> {
  const { error } = await client.from("token_usage_ledger").insert({
    organization_id: input.organization_id,
    agent_id: input.agent_id ?? null,
    request_id: input.request_id,
    model_used: input.model_used,
    call_kind: input.call_kind,
    tokens_in: input.tokens_in,
    tokens_out: input.tokens_out,
    duration_ms: input.duration_ms ?? null,
    status: input.status,
    error_code: input.error_code ?? null,
  });
  if (error) throw error;
}
