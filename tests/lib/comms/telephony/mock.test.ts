import { beforeEach, describe, expect, it } from "vitest";
import { MockTelephonyProvider } from "@/lib/comms/telephony/providers/mock";
import { CommsError } from "@/lib/comms/types";
import type {
  DispositionEvent,
  InboundCallEvent,
} from "@/lib/comms/telephony/types";

let p: MockTelephonyProvider;
beforeEach(() => {
  p = new MockTelephonyProvider();
  p.reset();
});

describe("MockTelephonyProvider", () => {
  it("declares its identity + capabilities", () => {
    expect(p.provider).toBe("mock");
    expect(p.capabilities.inbound).toBe(true);
    expect(p.capabilities.delivery_receipts).toBe(true);
  });

  it("outboundClickToCall records the call + returns queued status", async () => {
    const r = await p.outboundClickToCall({
      organization_id: "org-1",
      workspace_id: "ws-1",
      from_user_id: "u-1",
      to_phone_e164: "+919900011111",
      lead_id: "lead-1",
    });
    expect(r.provider_call_id).toMatch(/^mock-call-/);
    expect(r.status.state).toBe("queued");
    expect(p.getSent()).toHaveLength(1);
    expect(p.getSent()[0]?.to_phone_e164).toBe("+919900011111");
  });

  it("rejects missing required args", async () => {
    await expect(
      p.outboundClickToCall({
        organization_id: "",
        workspace_id: "ws-1",
        from_user_id: "u-1",
        to_phone_e164: "+919900011111",
      }),
    ).rejects.toBeInstanceOf(CommsError);
  });

  it("lookupCallStatus returns scripted state", async () => {
    const r = await p.outboundClickToCall({
      organization_id: "org-1",
      workspace_id: "ws-1",
      from_user_id: "u-1",
      to_phone_e164: "+919900011111",
    });
    p.setStatus(r.provider_call_id, {
      state: "connected",
      provider_call_id: r.provider_call_id,
      started_at: "2026-05-11T10:00:00Z",
    });
    const s = await p.lookupCallStatus(r.provider_call_id);
    expect(s?.state).toBe("connected");
  });

  it("inbound handler fires when emitInbound is invoked", async () => {
    const events: InboundCallEvent[] = [];
    const unsub = p.subscribeInbound((e) => {
      events.push(e);
    });
    await p.emitInbound({
      provider_call_id: "mc-99",
      organization_id: "org-1",
      workspace_id: "ws-1",
      from_phone_e164: "+919900099999",
      to_phone_e164: "+919900088888",
      started_at: "2026-05-11T10:00:00Z",
    });
    expect(events).toHaveLength(1);
    // unsubscribe is idempotent + stops delivery
    unsub();
    unsub();
    await p.emitInbound({
      ...events[0]!,
      provider_call_id: "mc-100",
    });
    expect(events).toHaveLength(1);
  });

  it("disposition handler fires + carries duration", async () => {
    const events: DispositionEvent[] = [];
    p.subscribeDisposition((e) => {
      events.push(e);
    });
    await p.emitDisposition({
      provider_call_id: "mc-101",
      organization_id: "org-1",
      workspace_id: "ws-1",
      disposition: "connected",
      duration_s: 75,
      ended_at: "2026-05-11T10:01:15Z",
    });
    expect(events[0]?.disposition).toBe("connected");
    expect(events[0]?.duration_s).toBe(75);
  });
});
