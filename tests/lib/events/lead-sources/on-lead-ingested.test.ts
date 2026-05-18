import { describe, expect, it } from "vitest";
import { onLeadIngested } from "@/lib/events/lead-sources";
import type { BuiltrixEvent } from "@/lib/events/types";

const NOW = "2026-05-13T10:00:00.000Z";
const ORG = "00000000-0000-4000-8000-0000000000ab";
const fakeClient = { __fake: true } as unknown as Parameters<
  typeof onLeadIngested
>[1]["client"];

function envelope(payload: Record<string, unknown>): BuiltrixEvent {
  return {
    event_id: "evt-abcd1234",
    organization_id: ORG,
    event_kind: "lead.ingested",
    source_product: "lead_sources",
    ts: NOW,
    payload,
  } as BuiltrixEvent;
}

describe("onLeadIngested", () => {
  it("accepts a valid payload", async () => {
    const r = await onLeadIngested(
      envelope({
        external_id: "FB-AD-12345",
        source: "meta_lead_ads",
        name: "Priya R",
        phone_e164: "+91-9999999999",
        email: "priya@example.com",
        captured_at: NOW,
      }),
      { client: fakeClient },
    );
    expect(r.ok).toBe(true);
  });

  it("accepts a minimum-shape payload (no optional fields)", async () => {
    const r = await onLeadIngested(
      envelope({
        external_id: "external-1",
        source: "justdial",
        captured_at: NOW,
      }),
      { client: fakeClient },
    );
    expect(r.ok).toBe(true);
  });

  it("rejects missing external_id", async () => {
    const r = await onLeadIngested(
      envelope({ source: "x", captured_at: NOW }),
      { client: fakeClient },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/invalid payload/);
  });

  it("rejects missing source", async () => {
    const r = await onLeadIngested(
      envelope({ external_id: "x", captured_at: NOW }),
      { client: fakeClient },
    );
    expect(r.ok).toBe(false);
  });

  it("rejects malformed email", async () => {
    const r = await onLeadIngested(
      envelope({
        external_id: "x",
        source: "y",
        email: "not-an-email",
        captured_at: NOW,
      }),
      { client: fakeClient },
    );
    expect(r.ok).toBe(false);
  });
});
