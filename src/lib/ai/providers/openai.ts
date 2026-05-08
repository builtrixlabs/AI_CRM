import OpenAI from "openai";
import type {
  ProviderCompleteResult,
  ProviderEmbedResult,
} from "../types";

export const OPENAI_DEFAULT_CHAT_MODEL = "gpt-4o-mini";
export const OPENAI_DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";

let cachedClient: OpenAI | null = null;
function getClient(): OpenAI {
  if (cachedClient) return cachedClient;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set");
  }
  cachedClient = new OpenAI({ apiKey });
  return cachedClient;
}

function classifyError<T extends ProviderCompleteResult | ProviderEmbedResult>(
  err: unknown,
): T {
  if (err instanceof OpenAI.APIError) {
    const status = err.status ?? 0;
    if (status === 429) return { ok: false, error: "rate_limit", message: err.message } as T;
    if (status >= 500 && status < 600) return { ok: false, error: "server", message: err.message } as T;
    if (status === 401 || status === 403) return { ok: false, error: "auth", message: err.message } as T;
    return { ok: false, error: "unknown", message: err.message } as T;
  }
  if (err instanceof Error && /fetch|network|ECONN/i.test(err.message)) {
    return { ok: false, error: "network", message: err.message } as T;
  }
  return {
    ok: false,
    error: "unknown",
    message: err instanceof Error ? err.message : String(err),
  } as T;
}

export type OpenAICompleteArgs = {
  prompt: string;
  system?: string;
  max_tokens?: number;
  model?: string;
};

export type OpenAICompleteImpl = (
  args: OpenAICompleteArgs,
) => Promise<ProviderCompleteResult>;

export const completeWithOpenAI: OpenAICompleteImpl = async (args) => {
  const client = getClient();
  const model = args.model ?? OPENAI_DEFAULT_CHAT_MODEL;
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
  if (args.system) messages.push({ role: "system", content: args.system });
  messages.push({ role: "user", content: args.prompt });
  try {
    const response = await client.chat.completions.create({
      model,
      messages,
      max_tokens: args.max_tokens ?? 1024,
    });
    const text = response.choices?.[0]?.message?.content ?? null;
    if (text == null) {
      return {
        ok: false,
        error: "parse",
        message: "OpenAI response had no message content",
      };
    }
    return {
      ok: true,
      text,
      model_used: model,
      tokens_in: response.usage?.prompt_tokens ?? 0,
      tokens_out: response.usage?.completion_tokens ?? 0,
    };
  } catch (err) {
    return classifyError<ProviderCompleteResult>(err);
  }
};

export type OpenAIEmbedArgs = {
  text: string;
  model?: string;
};

export type OpenAIEmbedImpl = (
  args: OpenAIEmbedArgs,
) => Promise<ProviderEmbedResult>;

export const embedWithOpenAI: OpenAIEmbedImpl = async (args) => {
  const client = getClient();
  const model = args.model ?? OPENAI_DEFAULT_EMBEDDING_MODEL;
  try {
    const response = await client.embeddings.create({
      model,
      input: args.text,
    });
    const vector = response.data?.[0]?.embedding;
    if (!Array.isArray(vector)) {
      return {
        ok: false,
        error: "parse",
        message: "OpenAI embedding response had no vector",
      };
    }
    return {
      ok: true,
      vector,
      model_used: model,
      tokens_in: response.usage?.prompt_tokens ?? 0,
    };
  } catch (err) {
    return classifyError<ProviderEmbedResult>(err);
  }
};
