import type { ProviderCapabilities } from "../types";

export const TELEPHONY_PROVIDER_IDS = [
  "mock",
  "exotel",
  "servetel",
  "knowlarity",
  "myoperator",
  "ozonetel",
] as const;
export type TelephonyProviderId = (typeof TELEPHONY_PROVIDER_IDS)[number];

export type CallStatus =
  | { state: "queued" }
  | { state: "ringing"; provider_call_id: string }
  | {
      state: "connected";
      provider_call_id: string;
      started_at: string;
    }
  | {
      state: "ended";
      provider_call_id: string;
      ended_at: string;
      duration_s: number;
    }
  | {
      state: "failed";
      provider_call_id?: string;
      reason: string;
    };

export type OutboundCallArgs = {
  organization_id: string;
  workspace_id: string;
  from_user_id: string;
  to_phone_e164: string;
  lead_id?: string;
  deal_id?: string;
};

export type InboundCallEvent = {
  provider_call_id: string;
  organization_id: string;
  workspace_id: string;
  from_phone_e164: string;
  to_phone_e164: string;
  started_at: string;
};

export type CallDisposition =
  | "connected"
  | "rnr"
  | "wrong_number"
  | "scheduled"
  | "voicemail"
  | "declined"
  | "busy"
  | "failed";

export type DispositionEvent = {
  provider_call_id: string;
  organization_id: string;
  workspace_id: string;
  disposition: CallDisposition;
  duration_s: number | null;
  ended_at: string;
};

export interface TelephonyAdapter {
  readonly provider: TelephonyProviderId;
  readonly capabilities: ProviderCapabilities;
  outboundClickToCall(
    args: OutboundCallArgs,
  ): Promise<{ provider_call_id: string; status: CallStatus }>;
  lookupCallStatus(provider_call_id: string): Promise<CallStatus | null>;
  subscribeInbound(
    handler: (e: InboundCallEvent) => void | Promise<void>,
  ): () => void;
  subscribeDisposition(
    handler: (e: DispositionEvent) => void | Promise<void>,
  ): () => void;
}
