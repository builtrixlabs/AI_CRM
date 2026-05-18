import { beforeEach, describe, expect, it } from "vitest";
import { MockEmailProvider } from "@/lib/comms/email/providers/mock";
import { CommsError } from "@/lib/comms/types";
import type { InboundEmailEvent } from "@/lib/comms/email/types";

let p: MockEmailProvider;
beforeEach(() => {
  p = new MockEmailProvider();
  p.reset();
});

describe("MockEmailProvider", () => {
  it("templated send records to outbox + returns thread_id = provider_message_id when no thread supplied", async () => {
    const r = await p.send({
      kind: "templated",
      organization_id: "org-1",
      template_id: "welcome",
      to: "buyer@example.com",
      data: { name: "Mr Patel" },
    });
    expect(r.provider_message_id).toMatch(/^mock-email-/);
    expect(r.thread_id).toBe(r.provider_message_id);
    expect(p.getOutbox()).toHaveLength(1);
  });

  it("custom send threads onto an existing thread_id when provided", async () => {
    const r = await p.send({
      kind: "custom",
      organization_id: "org-1",
      to: "buyer@example.com",
      subject: "Re: Site visit",
      body_text: "Confirmed.",
      thread_id: "thread-99",
    });
    expect(r.thread_id).toBe("thread-99");
  });

  it("rejects templated send missing template_id", async () => {
    await expect(
      p.send({
        kind: "templated",
        organization_id: "org-1",
        template_id: "",
        to: "x@y",
        data: {},
      }),
    ).rejects.toBeInstanceOf(CommsError);
  });

  it("rejects custom send missing subject", async () => {
    await expect(
      p.send({
        kind: "custom",
        organization_id: "org-1",
        to: "x@y",
        subject: "",
        body_text: "body",
      }),
    ).rejects.toBeInstanceOf(CommsError);
  });

  it("inbound handler fires on emitInbound", async () => {
    const received: InboundEmailEvent[] = [];
    p.subscribeInboundParsed((e) => {
      received.push(e);
    });
    await p.emitInbound({
      provider_message_id: "in-1",
      organization_id: "org-1",
      from: "buyer@example.com",
      to: "leads@org1.in",
      subject: "Re: Site visit",
      body_text: "I'll be there",
      thread_id: "thread-99",
      in_reply_to: "out-42",
      received_at: "2026-05-11T11:00:00Z",
    });
    expect(received[0]?.thread_id).toBe("thread-99");
  });
});
