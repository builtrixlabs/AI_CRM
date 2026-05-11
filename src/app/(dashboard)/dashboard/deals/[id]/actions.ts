"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  transitionDealStageInputSchema,
  type TransitionDealStageInput,
  type TransitionDealStageResult,
} from "@/lib/booking/types";

function fieldErrorsFromZod(err: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = String(issue.path[0] ?? "_form");
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}

function stringOrUndef(raw: FormDataEntryValue | null): string | undefined {
  if (raw == null || typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  return trimmed === "" ? undefined : trimmed;
}

function parseJsonField<T>(raw: FormDataEntryValue | null, fallback: T): T {
  if (typeof raw !== "string" || raw.trim() === "") return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function classifyRpcError(message: string): TransitionDealStageResult {
  // Postgres RAISE EXCEPTION messages bubble through PostgREST as the
  // exception text. We pattern-match the canonical codes the RPC raises.
  if (message.includes("invalid_transition")) {
    return { ok: false, error: "invalid_transition", message };
  }
  if (message.includes("no_provenance")) {
    return { ok: false, error: "no_provenance", message };
  }
  if (message.includes("access_denied")) {
    return { ok: false, error: "permission", message };
  }
  if (message.includes("deal_not_found")) {
    return { ok: false, error: "deal_not_found", message };
  }
  if (message.includes("not_a_deal")) {
    return { ok: false, error: "not_a_deal", message };
  }
  return { ok: false, error: "unknown", message };
}

/**
 * D-421 — server action that invokes the transition_stage RPC.
 *
 * Inputs (via FormData):
 *   - deal_id (uuid)
 *   - to_stage (BookingStage)
 *   - evidence (JSON string)
 *   - skip_reason (optional 'cash_buyer' | 'fully_cashed')
 *   - correction_reason (optional, required for backward correction)
 *
 * Always generates a fresh UUIDv4 idempotency_key per call. Callers wanting
 * client-driven idempotency (e.g. retry on network flake) can re-submit the
 * same key by passing `idempotency_key` in the form data; if absent we
 * generate. The RPC dedupes on (deal_id, idempotency_key).
 */
export async function transitionDealStageAction(
  formData: FormData
): Promise<TransitionDealStageResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "permission" };
  if (!user.org_id) {
    return { ok: false, error: "validation", message: "User has no org" };
  }

  const parsed = transitionDealStageInputSchema.safeParse({
    deal_id: stringOrUndef(formData.get("deal_id")),
    to_stage: stringOrUndef(formData.get("to_stage")),
    evidence: parseJsonField<Record<string, unknown>>(
      formData.get("evidence"),
      {}
    ),
    skip_reason: stringOrUndef(formData.get("skip_reason")) ?? null,
    correction_reason: stringOrUndef(formData.get("correction_reason")) ?? null,
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: "validation",
      fieldErrors: fieldErrorsFromZod(parsed.error),
    };
  }
  const input: TransitionDealStageInput = parsed.data;

  // Idempotency: caller-supplied or freshly generated.
  const clientKey = stringOrUndef(formData.get("idempotency_key"));
  const idempotency_key = clientKey ?? crypto.randomUUID();

  const client = await createSupabaseServerClient();
  const { data, error } = await client.rpc("transition_stage", {
    p_deal_id: input.deal_id,
    p_to_stage: input.to_stage,
    p_idempotency_key: idempotency_key,
    p_evidence: input.evidence,
    p_skip_reason: input.skip_reason ?? null,
    p_correction_reason: input.correction_reason ?? null,
  });

  if (error) {
    return classifyRpcError(error.message ?? "");
  }
  const transition_id = typeof data === "string" ? data : String(data);

  revalidatePath(`/dashboard/deals/${input.deal_id}`);
  return { ok: true, transition_id };
}

export async function transitionDealStageFormAction(
  formData: FormData
): Promise<void> {
  await transitionDealStageAction(formData);
}
