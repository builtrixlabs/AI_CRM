import Anthropic from "@anthropic-ai/sdk";
import { getSecret } from "@/lib/secrets/getSecret";
import type {
  ProviderCompleteResult,
} from "../types";

/** Default model. Documented in baseline 115. */
export const ANTHROPIC_DEFAULT_MODEL = "claude-sonnet-4-6";

// Per-key cache: rebuild the SDK client only when the key changes.
// Rotations via /platform/settings/secrets call invalidateSecretCache,
// so the next call lands a different key and we rebuild.
let cachedClient: Anthropic | null = null;
let cachedKey: string | null = null;
async function getClient(): Promise<Anthropic> {
  const apiKey = await getSecret("anthropic_api_key");
  if (!apiKey) {
    throw new Error(
      "Anthropic API key is not configured. Set it in /platform/settings/secrets or via ANTHROPIC_API_KEY env var."
    );
  }
  if (cachedClient && cachedKey === apiKey) return cachedClient;
  cachedClient = new Anthropic({ apiKey });
  cachedKey = apiKey;
  return cachedClient;
}

export type AnthropicCompleteArgs = {
  prompt: string;
  system?: string;
  max_tokens?: number;
  model?: string;
};

/** Optional shape used by tests to mock the SDK at the call seam. */
export type AnthropicCompleteImpl = (
  args: AnthropicCompleteArgs,
) => Promise<ProviderCompleteResult>;

function classifyError(err: unknown): ProviderCompleteResult {
  if (err instanceof Anthropic.APIError) {
    const status = err.status ?? 0;
    if (status === 429) {
      return { ok: false, error: "rate_limit", message: err.message };
    }
    if (status >= 500 && status < 600) {
      return { ok: false, error: "server", message: err.message };
    }
    if (status === 401 || status === 403) {
      return { ok: false, error: "auth", message: err.message };
    }
    return { ok: false, error: "unknown", message: err.message };
  }
  if (err instanceof Error && /fetch|network|ECONN/i.test(err.message)) {
    return { ok: false, error: "network", message: err.message };
  }
  return {
    ok: false,
    error: "unknown",
    message: err instanceof Error ? err.message : String(err),
  };
}

/**
 * Default Anthropic implementation. Tests should use the
 * gateway's dependency-injection (the gateway accepts an `impl`
 * override) rather than mocking this module directly.
 */
export const completeWithAnthropic: AnthropicCompleteImpl = async (args) => {
  const client = await getClient();
  const model = args.model ?? ANTHROPIC_DEFAULT_MODEL;
  try {
    const message = await client.messages.create({
      model,
      max_tokens: args.max_tokens ?? 1024,
      system: args.system ?? undefined,
      messages: [{ role: "user", content: args.prompt }],
    });
    const block = message.content?.[0];
    const text =
      block && "text" in block && typeof block.text === "string"
        ? block.text
        : null;
    if (text == null) {
      return {
        ok: false,
        error: "parse",
        message: "Anthropic response had no text block",
      };
    }
    return {
      ok: true,
      text,
      model_used: model,
      tokens_in: message.usage?.input_tokens ?? 0,
      tokens_out: message.usage?.output_tokens ?? 0,
    };
  } catch (err) {
    return classifyError(err);
  }
};
