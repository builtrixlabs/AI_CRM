# Baseline 116 — Communication providers contract

**Status:** PROVISIONAL (lives under `docs/baselines/` during V4 horizon; promotes to `baseline/116-*` when V4 reaches main and the operator unblocks the baseline-write hook).
**Owner directives:** D-118 (telephony) + D-119 (email + SMS).
**Lands:** D-418 (this directive's adapter shells).

This baseline freezes the interface contract every comms provider — telephony, email, SMS — must conform to. Live provider implementations (Exotel, Postmark, MSG91, etc.) MUST implement these interfaces exactly; they MAY extend `capabilities` but MUST NOT redefine existing method signatures.

---

## 1. Provider-agnostic shape (all three channels)

Every channel adapter exposes:

```ts
type ProviderId = string;          // 'mock' | 'exotel' | 'postmark' | ...
type ProviderCapabilities = {
  inbound: boolean;                // does the provider deliver inbound events?
  delivery_receipts: boolean;      // emits per-message status events?
  templates_required: boolean;     // some channels (SMS DLT) require pre-registered templates
};

interface ChannelAdapter<SendArgs, SendResult, InboundEvent> {
  readonly provider: ProviderId;
  readonly capabilities: ProviderCapabilities;
  send(args: SendArgs): Promise<SendResult>;
  subscribe?(handler: (event: InboundEvent) => void | Promise<void>): () => void;
}
```

The unsubscribe function (returned from `subscribe`) MUST be idempotent.

**Selection.** An org's active provider per channel is stored in `org_integration_secrets` (D-016). The `getProvider(id)` function reads the registry; `getProviderForOrg(org_id, channel)` resolves via the secrets table. Until an org configures a provider, `getProviderForOrg` throws `NoProviderConfigured` and downstream code MUST treat that as "comms not sent" (NOT mock-send).

---

## 2. Telephony adapter (D-118)

```ts
type CallStatus =
  | { state: 'queued' }
  | { state: 'ringing'; provider_call_id: string }
  | { state: 'connected'; provider_call_id: string; started_at: string }
  | { state: 'ended';     provider_call_id: string; ended_at: string; duration_s: number }
  | { state: 'failed';    provider_call_id?: string; reason: string };

type OutboundCallArgs = {
  organization_id: string;
  workspace_id: string;
  from_user_id: string;     // CRM user initiating the click-to-call
  to_phone_e164: string;    // destination buyer phone (E.164)
  lead_id?: string;
  deal_id?: string;
};

type InboundCallEvent = {
  provider_call_id: string;
  organization_id: string;
  workspace_id: string;
  from_phone_e164: string;
  to_phone_e164: string;   // the rep's mapped extension
  started_at: string;
};

type DispositionEvent = {
  provider_call_id: string;
  organization_id: string;
  workspace_id: string;
  disposition:
    | 'connected'
    | 'rnr'                  // ring no answer
    | 'wrong_number'
    | 'scheduled'
    | 'voicemail'
    | 'declined'
    | 'busy'
    | 'failed';
  duration_s: number | null;
  ended_at: string;
};

interface TelephonyAdapter {
  readonly provider: TelephonyProviderId;
  readonly capabilities: ProviderCapabilities;
  outboundClickToCall(args: OutboundCallArgs): Promise<{ provider_call_id: string; status: CallStatus }>;
  lookupCallStatus(provider_call_id: string): Promise<CallStatus | null>;
  subscribeInbound(handler: (e: InboundCallEvent) => void | Promise<void>): () => void;
  subscribeDisposition(handler: (e: DispositionEvent) => void | Promise<void>): () => void;
}
```

**Hard rule (PRD §3 P2): NO call recording.** Providers MUST NOT request the audio. Voice IQ owns recording via its own integration; the telephony adapter only emits `call.completed` events with the `provider_call_id`, and Voice IQ ingests separately.

**Disposition write-back.** When a `DispositionEvent` arrives:
1. Look up the lead (if any) by phone + org.
2. Append an `activity` node (`node_type='activity'`, `data.kind='call'`, `data.disposition=...`).
3. Update the call node's state via D-014 event bus.

**Provider id catalog** (string union, expand as providers land):
`'mock' | 'exotel' | 'servetel' | 'knowlarity' | 'myoperator' | 'ozonetel'`.

---

## 3. Email adapter (D-119)

```ts
type EmailSendArgs =
  | {
      kind: 'templated';
      organization_id: string;
      template_id: string;          // org-configured template
      to: string;                   // recipient
      thread_id?: string;           // for In-Reply-To threading
      data: Record<string, unknown>; // template variables
    }
  | {
      kind: 'custom';
      organization_id: string;
      to: string;
      subject: string;
      body_text: string;
      body_html?: string;
      thread_id?: string;
    };

type EmailSendResult = {
  provider_message_id: string;
  thread_id: string;
};

type InboundEmailEvent = {
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

interface EmailAdapter {
  readonly provider: EmailProviderId;
  readonly capabilities: ProviderCapabilities;
  send(args: EmailSendArgs): Promise<EmailSendResult>;
  subscribeInboundParsed(handler: (e: InboundEmailEvent) => void | Promise<void>): () => void;
}
```

**Threading.** Outbound `thread_id` is the original message's `provider_message_id`. Adapters MUST set `In-Reply-To: <thread_id>` header so the buyer's reply lands on the same thread when their MUA respects RFC 5322.

**Provider id catalog:** `'mock' | 'postmark' | 'resend'`.

---

## 4. SMS adapter (D-119)

```ts
type SmsSendArgs = {
  kind: 'templated';        // SMS is one-way; only templated outbound exists
  organization_id: string;
  template_id: string;      // DLT-registered template id
  to_phone_e164: string;
  data: Record<string, string>;  // template variables
};

type SmsSendResult = {
  provider_message_id: string;
  template_id: string;
};

interface SmsAdapter {
  readonly provider: SmsProviderId;
  readonly capabilities: ProviderCapabilities;
  send(args: SmsSendArgs): Promise<SmsSendResult>;
  /** No inbound — DLT one-way only. `subscribe` is undefined. */
}
```

**DLT registry.** Every templated send MUST resolve `template_id` against the org's registered DLT template catalog. Sends with unknown templates MUST be rejected at the adapter layer (not just the provider) so we fail before hitting the wire. The mock provider implements this check identically to live providers.

**Provider id catalog:** `'mock' | 'msg91' | 'gupshup'`.

---

## 5. Errors

All adapters throw structured errors from a single `CommsError` class:

```ts
class CommsError extends Error {
  constructor(
    message: string,
    public readonly kind:
      | 'invalid_args'        // 4xx-equivalent
      | 'provider_unavailable' // provider transient (5xx) — caller may retry
      | 'unauthorized'         // bad provider creds
      | 'template_not_found'   // SMS DLT, email templated
      | 'rate_limited'
      | 'not_configured',      // org hasn't configured a provider for this channel
  ) { super(message); this.name = 'CommsError'; }
}
```

Callers (D-415 follow-up agent, D-416 custom outbound, future DOE directives) MUST handle `not_configured` as silent no-op + warning log (never throw to the user). All other kinds are surface-able errors.

---

## 6. Provenance + audit (Constitution III, IV)

Every successful `send` MUST result in:
- A `node_type='activity'` row attached to the lead/deal with `data.channel` and `data.provider`.
- An `audit_log` row with `action='comms_sent'`, `diff: { channel, provider, recipient_hash }` (hash the recipient to keep PII out of audit_log).

Failures: same audit row but `action='comms_failed'`, with `diff: { channel, provider, reason }`.

---

## 7. Versioning

This baseline is `v1`. Backward-incompatible changes (signature changes, removed methods) require a baseline version bump + migration plan for existing live provider implementations. Additive changes (new optional capabilities, new provider ids) ride this version.
