import type { ProviderCapabilities } from "../types";

export const EMAIL_PROVIDER_IDS = ["mock", "postmark", "resend"] as const;
export type EmailProviderId = (typeof EMAIL_PROVIDER_IDS)[number];

export type EmailSendTemplatedArgs = {
  kind: "templated";
  organization_id: string;
  template_id: string;
  to: string;
  thread_id?: string;
  data: Record<string, unknown>;
};

export type EmailSendCustomArgs = {
  kind: "custom";
  organization_id: string;
  to: string;
  subject: string;
  body_text: string;
  body_html?: string;
  thread_id?: string;
};

export type EmailSendArgs = EmailSendTemplatedArgs | EmailSendCustomArgs;

export type EmailSendResult = {
  provider_message_id: string;
  thread_id: string;
};

export type InboundEmailEvent = {
  provider_message_id: string;
  organization_id: string;
  from: string;
  to: string;
  subject: string;
  body_text: string;
  body_html?: string;
  thread_id: string;
  in_reply_to?: string;
  received_at: string;
};

export interface EmailAdapter {
  readonly provider: EmailProviderId;
  readonly capabilities: ProviderCapabilities;
  send(args: EmailSendArgs): Promise<EmailSendResult>;
  subscribeInboundParsed(
    handler: (e: InboundEmailEvent) => void | Promise<void>,
  ): () => void;
}
