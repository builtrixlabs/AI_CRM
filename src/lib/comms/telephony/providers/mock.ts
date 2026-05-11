import type {
  CallStatus,
  DispositionEvent,
  InboundCallEvent,
  OutboundCallArgs,
  TelephonyAdapter,
} from "../types";
import { CommsError } from "../../types";

let counter = 0;
const nextId = () => `mock-call-${++counter}`;

type Recorded = OutboundCallArgs & { provider_call_id: string; at: string };

/**
 * In-process mock telephony provider. Records every outbound call into an
 * internal buffer; exposes `getSent` and `emit{Inbound,Disposition}` so tests
 * can assert + script inbound/disposition events. NEVER contacts a real
 * provider.
 *
 * The mock instance is stateful — registry returns a fresh instance per
 * `getProvider('mock')` call so tests don't bleed state. For long-lived
 * production wiring (D-415, D-416), instantiate once and hold the handle.
 */
export class MockTelephonyProvider implements TelephonyAdapter {
  readonly provider = "mock" as const;
  readonly capabilities = {
    inbound: true,
    delivery_receipts: true,
    templates_required: false,
  };

  private sent: Recorded[] = [];
  private statuses = new Map<string, CallStatus>();
  private inboundHandlers = new Set<(e: InboundCallEvent) => void | Promise<void>>();
  private dispoHandlers = new Set<
    (e: DispositionEvent) => void | Promise<void>
  >();

  async outboundClickToCall(
    args: OutboundCallArgs,
  ): Promise<{ provider_call_id: string; status: CallStatus }> {
    if (!args.to_phone_e164 || !args.organization_id) {
      throw new CommsError("missing required call args", "invalid_args");
    }
    const provider_call_id = nextId();
    const status: CallStatus = { state: "queued" };
    this.sent.push({ ...args, provider_call_id, at: new Date().toISOString() });
    this.statuses.set(provider_call_id, status);
    return { provider_call_id, status };
  }

  async lookupCallStatus(
    provider_call_id: string,
  ): Promise<CallStatus | null> {
    return this.statuses.get(provider_call_id) ?? null;
  }

  subscribeInbound(handler: (e: InboundCallEvent) => void | Promise<void>) {
    this.inboundHandlers.add(handler);
    return () => this.inboundHandlers.delete(handler);
  }

  subscribeDisposition(
    handler: (e: DispositionEvent) => void | Promise<void>,
  ) {
    this.dispoHandlers.add(handler);
    return () => this.dispoHandlers.delete(handler);
  }

  // ── Test-only helpers ────────────────────────────────────────────────
  getSent(): readonly Recorded[] {
    return this.sent.slice();
  }

  setStatus(provider_call_id: string, status: CallStatus): void {
    this.statuses.set(provider_call_id, status);
  }

  async emitInbound(e: InboundCallEvent): Promise<void> {
    for (const h of this.inboundHandlers) await h(e);
  }

  async emitDisposition(e: DispositionEvent): Promise<void> {
    for (const h of this.dispoHandlers) await h(e);
  }

  reset(): void {
    this.sent = [];
    this.statuses.clear();
    this.inboundHandlers.clear();
    this.dispoHandlers.clear();
  }
}
