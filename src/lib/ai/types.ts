export const AGENT_TIERS = ["T0", "T1", "T2", "T3", "T4"] as const;
export type AgentTier = (typeof AGENT_TIERS)[number];

export type GatewayCallContext = {
  organization_id: string | null;
  agent_id?: string | null;
  agent_tier?: AgentTier;
  /** Optional override; gateway generates one if absent. */
  request_id?: string;
};

export type GatewayWarning = "budget-80";

export type CompleteInput = GatewayCallContext & {
  prompt: string;
  system?: string;
  /** Defaults to 'anthropic'. */
  model_pref?: "anthropic" | "openai";
  max_tokens?: number;
};

export type CompleteOk = {
  ok: true;
  text: string;
  model_used: string;
  tokens_in: number;
  tokens_out: number;
  duration_ms: number;
  warnings?: GatewayWarning[];
};

export type GatewayErrorCode =
  | "budget"
  | "rate_limit"
  | "parse"
  | "network"
  | "unknown";

export type GatewayErr = {
  ok: false;
  error: GatewayErrorCode;
  message: string;
};

export type CompleteResult = CompleteOk | GatewayErr;

export type EmbedInput = GatewayCallContext & { text: string };

export type EmbedOk = {
  ok: true;
  vector: number[];
  model_used: string;
  tokens_in: number;
  duration_ms: number;
  warnings?: GatewayWarning[];
};

export type EmbedResult = EmbedOk | GatewayErr;

/** Provider-normalized successful complete shape. */
export type ProviderCompleteOk = {
  ok: true;
  text: string;
  model_used: string;
  tokens_in: number;
  tokens_out: number;
};

/** Provider-normalized successful embed shape. */
export type ProviderEmbedOk = {
  ok: true;
  vector: number[];
  model_used: string;
  tokens_in: number;
};

export type ProviderErr = {
  ok: false;
  /** Coarse category — gateway uses this to decide fallback. */
  error: "rate_limit" | "server" | "network" | "auth" | "parse" | "unknown";
  message: string;
};

export type ProviderCompleteResult = ProviderCompleteOk | ProviderErr;
export type ProviderEmbedResult = ProviderEmbedOk | ProviderErr;
