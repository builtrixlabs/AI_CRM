import type { ProviderCapabilities } from "../types";

export const SMS_PROVIDER_IDS = ["mock", "msg91", "gupshup"] as const;
export type SmsProviderId = (typeof SMS_PROVIDER_IDS)[number];

export type SmsSendArgs = {
  kind: "templated";
  organization_id: string;
  template_id: string;
  to_phone_e164: string;
  data: Record<string, string>;
};

export type SmsSendResult = {
  provider_message_id: string;
  template_id: string;
};

export interface SmsAdapter {
  readonly provider: SmsProviderId;
  readonly capabilities: ProviderCapabilities;
  send(args: SmsSendArgs): Promise<SmsSendResult>;
}
