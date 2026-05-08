import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  MONTHLY_TOKEN_CAP,
  TokenBudgetExceededError,
  checkBudget,
} from "./budget";
import { recordCall } from "./ledger";
import {
  completeWithAnthropic,
  type AnthropicCompleteImpl,
} from "./providers/anthropic";
import {
  completeWithOpenAI,
  embedWithOpenAI,
  type OpenAICompleteImpl,
  type OpenAIEmbedImpl,
  OPENAI_DEFAULT_EMBEDDING_MODEL,
} from "./providers/openai";
import type {
  CompleteInput,
  CompleteResult,
  EmbedInput,
  EmbedResult,
  GatewayWarning,
  ProviderErr,
} from "./types";

export type GatewayDeps = {
  /** Inject for tests; defaults to the production Anthropic SDK call. */
  anthropic?: AnthropicCompleteImpl;
  /** Inject for tests; defaults to the production OpenAI chat call. */
  openai?: OpenAICompleteImpl;
  /** Inject for tests; defaults to the production OpenAI embeddings call. */
  embed?: OpenAIEmbedImpl;
  /** Inject for tests; defaults to the service-role client. */
  client?: SupabaseClient;
};

const FALLBACK_TRIGGER_ERRORS = new Set<ProviderErr["error"]>([
  "rate_limit",
  "server",
  "network",
]);

function rough_estimate_tokens(text: string): number {
  // Char/4 is a stable heuristic for English-ish prompts.
  return Math.ceil(text.length / 4);
}

export async function complete(
  input: CompleteInput,
  deps: GatewayDeps = {},
): Promise<CompleteResult> {
  const start = Date.now();
  const request_id = input.request_id ?? randomUUID();
  const anthropic = deps.anthropic ?? completeWithAnthropic;
  const openai = deps.openai ?? completeWithOpenAI;

  // ── Budget pre-check (only when an org is supplied) ─────────────
  let warnings: GatewayWarning[] | undefined;
  if (input.organization_id) {
    const estimated =
      rough_estimate_tokens(input.prompt) +
      rough_estimate_tokens(input.system ?? "") +
      (input.max_tokens ?? 1024);
    const budget = await checkBudget(input.organization_id, estimated, deps.client);
    if (budget.kind === "exceeded") {
      await recordCall(
        {
          organization_id: input.organization_id,
          agent_id: input.agent_id ?? null,
          request_id,
          model_used: "n/a",
          call_kind: "complete",
          tokens_in: 0,
          tokens_out: 0,
          duration_ms: Date.now() - start,
          status: "error",
          error_code: "budget",
        },
        deps.client,
      );
      throw new TokenBudgetExceededError(
        input.organization_id,
        budget.used,
        budget.cap,
      );
    }
    if (budget.kind === "warn") {
      warnings = ["budget-80"];
    }
  }

  // ── Provider call: Anthropic primary, OpenAI fallback on transients ──
  const wantsOpenAIFirst = input.model_pref === "openai";
  let result = wantsOpenAIFirst
    ? await openai({ prompt: input.prompt, system: input.system, max_tokens: input.max_tokens })
    : await anthropic({ prompt: input.prompt, system: input.system, max_tokens: input.max_tokens });
  let used_fallback = false;
  if (!result.ok && FALLBACK_TRIGGER_ERRORS.has(result.error)) {
    used_fallback = true;
    result = wantsOpenAIFirst
      ? await anthropic({ prompt: input.prompt, system: input.system, max_tokens: input.max_tokens })
      : await openai({ prompt: input.prompt, system: input.system, max_tokens: input.max_tokens });
  }

  const duration_ms = Date.now() - start;

  if (!result.ok) {
    await recordCall(
      {
        organization_id: input.organization_id,
        agent_id: input.agent_id ?? null,
        request_id,
        model_used: used_fallback ? "fallback-failed" : "primary-failed",
        call_kind: "complete",
        tokens_in: 0,
        tokens_out: 0,
        duration_ms,
        status: "error",
        error_code: result.error,
      },
      deps.client,
    );
    return {
      ok: false,
      error:
        result.error === "rate_limit"
          ? "rate_limit"
          : result.error === "network"
            ? "network"
            : result.error === "parse"
              ? "parse"
              : "unknown",
      message: result.message,
    };
  }

  await recordCall(
    {
      organization_id: input.organization_id,
      agent_id: input.agent_id ?? null,
      request_id,
      model_used: result.model_used,
      call_kind: "complete",
      tokens_in: result.tokens_in,
      tokens_out: result.tokens_out,
      duration_ms,
      status: "ok",
    },
    deps.client,
  );

  return {
    ok: true,
    text: result.text,
    model_used: result.model_used,
    tokens_in: result.tokens_in,
    tokens_out: result.tokens_out,
    duration_ms,
    ...(warnings ? { warnings } : {}),
  };
}

export async function embed(
  input: EmbedInput,
  deps: GatewayDeps = {},
): Promise<EmbedResult> {
  const start = Date.now();
  const request_id = input.request_id ?? randomUUID();
  const embedImpl = deps.embed ?? embedWithOpenAI;

  // Budget check
  let warnings: GatewayWarning[] | undefined;
  if (input.organization_id) {
    const estimated = rough_estimate_tokens(input.text);
    const budget = await checkBudget(
      input.organization_id,
      estimated,
      deps.client,
    );
    if (budget.kind === "exceeded") {
      await recordCall(
        {
          organization_id: input.organization_id,
          agent_id: input.agent_id ?? null,
          request_id,
          model_used: OPENAI_DEFAULT_EMBEDDING_MODEL,
          call_kind: "embed",
          tokens_in: 0,
          tokens_out: 0,
          duration_ms: Date.now() - start,
          status: "error",
          error_code: "budget",
        },
        deps.client,
      );
      throw new TokenBudgetExceededError(
        input.organization_id,
        budget.used,
        budget.cap,
      );
    }
    if (budget.kind === "warn") {
      warnings = ["budget-80"];
    }
  }

  const result = await embedImpl({ text: input.text });
  const duration_ms = Date.now() - start;

  if (!result.ok) {
    await recordCall(
      {
        organization_id: input.organization_id,
        agent_id: input.agent_id ?? null,
        request_id,
        model_used: OPENAI_DEFAULT_EMBEDDING_MODEL,
        call_kind: "embed",
        tokens_in: 0,
        tokens_out: 0,
        duration_ms,
        status: "error",
        error_code: result.error,
      },
      deps.client,
    );
    return {
      ok: false,
      error:
        result.error === "rate_limit"
          ? "rate_limit"
          : result.error === "network"
            ? "network"
            : result.error === "parse"
              ? "parse"
              : "unknown",
      message: result.message,
    };
  }

  await recordCall(
    {
      organization_id: input.organization_id,
      agent_id: input.agent_id ?? null,
      request_id,
      model_used: result.model_used,
      call_kind: "embed",
      tokens_in: result.tokens_in,
      tokens_out: 0,
      duration_ms,
      status: "ok",
    },
    deps.client,
  );

  return {
    ok: true,
    vector: result.vector,
    model_used: result.model_used,
    tokens_in: result.tokens_in,
    duration_ms,
    ...(warnings ? { warnings } : {}),
  };
}

/**
 * Limit baseline 115's "MONTHLY_TOKEN_CAP" knob is exposed here for
 * other callers (cost dashboards, debug). Tests assert this value
 * in budget.test.ts.
 */
export { MONTHLY_TOKEN_CAP, TokenBudgetExceededError };
