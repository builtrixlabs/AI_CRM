/**
 * The known secret kinds. Each maps to:
 *   - a row key in `platform_secrets.kind`
 *   - a `process.env` fallback name
 *
 * Adding a new kind requires:
 *   1. Append to `SECRET_KINDS`.
 *   2. Add the `env_name` mapping in `ENV_FALLBACK`.
 *   3. Wire the caller to `getSecret(kind)`.
 */

export const SECRET_KINDS = [
  "anthropic_api_key",
  "openai_api_key",
  "whatsapp_webhook_secret",
  "builtrix_event_inbox_secret",
] as const;

export type SecretKind = (typeof SECRET_KINDS)[number];

export const ENV_FALLBACK: Record<SecretKind, string> = {
  anthropic_api_key: "ANTHROPIC_API_KEY",
  openai_api_key: "OPENAI_API_KEY",
  whatsapp_webhook_secret: "WHATSAPP_WEBHOOK_SECRET",
  builtrix_event_inbox_secret: "BUILTRIX_EVENT_INBOX_SECRET",
};

/** Pretty labels for the super-admin UI. */
export const SECRET_LABELS: Record<SecretKind, string> = {
  anthropic_api_key: "Anthropic API key",
  openai_api_key: "OpenAI API key",
  whatsapp_webhook_secret: "WhatsApp webhook secret",
  builtrix_event_inbox_secret: "Builtrix event-bus secret",
};

export type RedactedSecret = {
  kind: SecretKind;
  last4: string | null;
  is_set: boolean;
  source: "db" | "env" | "none";
  rotated_at: string | null;
};
