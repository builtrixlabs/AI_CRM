/**
 * D-432 — WhatsApp adapter contract (Gupshup + Meta Cloud API).
 *
 * WhatsApp Business API only allows unsolicited sends via pre-approved
 * templates, so the adapter only supports `kind: "template"`. Each org's
 * approved template IDs are loaded from org_whatsapp_endpoints.
 * approved_template_ids and checked at the adapter level — sends with
 * unknown template_id fail-closed with template_not_found.
 */

import type { ProviderCapabilities } from "../types";

export const WHATSAPP_PROVIDER_IDS = [
  "mock",
  "gupshup",
  "cloud_api",
] as const;
export type WhatsAppProviderId = (typeof WHATSAPP_PROVIDER_IDS)[number];

export type WhatsAppSendArgs = {
  kind: "template";
  organization_id: string;
  template_id: string; // pre-approved template name in WhatsApp Business Manager
  to_phone_e164: string;
  language_code?: string; // default en_US
  data: Record<string, string>; // body variables — { var1, var2, ... }
};

export type WhatsAppSendResult = {
  provider_message_id: string;
  template_id: string;
};

export type InboundWhatsAppEvent = {
  provider_message_id: string;
  organization_id: string;
  from_phone_e164: string;
  to_phone_e164: string;
  body_text: string;
  received_at: string;
};

export interface WhatsAppAdapter {
  readonly provider: WhatsAppProviderId;
  readonly capabilities: ProviderCapabilities;
  send(args: WhatsAppSendArgs): Promise<WhatsAppSendResult>;
  subscribeInbound(
    handler: (e: InboundWhatsAppEvent) => void | Promise<void>,
  ): () => void;
}
