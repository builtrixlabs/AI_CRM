import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  onCallAudited: vi.fn(),
  onCallObjectionDetected: vi.fn(),
}));
vi.mock("@/lib/events/call-audit/onCallAudited", () => ({
  onCallAudited: mocks.onCallAudited,
}));
vi.mock("@/lib/events/call-audit/onCallObjectionDetected", () => ({
  onCallObjectionDetected: mocks.onCallObjectionDetected,
}));

import {
  dispatchInboxEvent,
  findExistingNodeForEvent,
} from "@/lib/events/inbox";
import type { BuiltrixEvent } from "@/lib/events/types";

const ORG = "11111111-2222-4333-8444-555555555555";

function makeClient(opts: {
  existing?: { id: string } | null;
}) {
  const inserts: { event_inbox_log: unknown[] } = { event_inbox_log: [] };

  const nodesChain = {
    select: vi.fn(() => nodesChain),
    eq: vi.fn(() => nodesChain),
    is: vi.fn(() => nodesChain),
    limit: vi.fn(() =>
      Promise.resolve({
        data: opts.existing ? [opts.existing] : [],
        error: null,
      })
    ),
  };
  const client = {
    from: vi.fn((table: string) => {
      if (table === "nodes") return nodesChain;
      if (table === "event_inbox_log") {
        return {
          insert: vi.fn((row: unknown) => {
            inserts.event_inbox_log.push(row);
            return Promise.resolve({ error: null });
          }),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    }),
  };
  return { client, inserts };
}

const baseEnvelope: BuiltrixEvent = {
  event_id: "evt-1234",
  organization_id: ORG,
  event_kind: "call.audited",
  source_product: "call_audit",
  ts: "2026-05-08T10:00:00.000Z",
  payload: { lead_id: "11111111-2222-3333-4444-555555555555" },
};

beforeEach(() => {
  mocks.onCallAudited.mockReset();
  mocks.onCallAudited.mockResolvedValue({
    ok: true,
    status: "ok",
    deduped: false,
    node_id: "call-1",
  });
  mocks.onCallObjectionDetected.mockReset();
  mocks.onCallObjectionDetected.mockResolvedValue({
    ok: true,
    status: "ok",
    deduped: false,
    node_id: "call-2",
  });
});

describe("dispatchInboxEvent", () => {
  it("rejects an envelope that fails schema validation", async () => {
    const { client, inserts } = makeClient({});
    const result = await dispatchInboxEvent(
      { ...baseEnvelope, organization_id: "not-a-uuid" } as never,
      { client: client as never }
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("envelope");
    // Even rejected envelopes write a ledger row from the route.
    expect(inserts.event_inbox_log).toHaveLength(0); // dispatch doesn't log when schema fails
  });

  it("returns deduped:true when an existing node carries the event_id", async () => {
    const { client, inserts } = makeClient({ existing: { id: "node-1" } });
    const result = await dispatchInboxEvent(baseEnvelope, {
      client: client as never,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.deduped).toBe(true);
    expect(result.node_id).toBe("node-1");
    expect(mocks.onCallAudited).not.toHaveBeenCalled();
    expect(inserts.event_inbox_log).toHaveLength(1);
    expect(
      (inserts.event_inbox_log[0] as { status: string }).status
    ).toBe("deduped");
  });

  it("dispatches call.audited handler", async () => {
    const { client, inserts } = makeClient({ existing: null });
    const result = await dispatchInboxEvent(baseEnvelope, {
      client: client as never,
    });
    expect(result.ok).toBe(true);
    expect(mocks.onCallAudited).toHaveBeenCalledTimes(1);
    expect(inserts.event_inbox_log).toHaveLength(1);
    expect(
      (inserts.event_inbox_log[0] as { status: string }).status
    ).toBe("ok");
  });

  it("dispatches call.objection_detected handler", async () => {
    const { client } = makeClient({ existing: null });
    await dispatchInboxEvent(
      { ...baseEnvelope, event_kind: "call.objection_detected" },
      { client: client as never }
    );
    expect(mocks.onCallObjectionDetected).toHaveBeenCalledTimes(1);
  });

  it("rejects unknown event_kind", async () => {
    const { client, inserts } = makeClient({ existing: null });
    const result = await dispatchInboxEvent(
      { ...baseEnvelope, event_kind: "unknown.kind" },
      { client: client as never }
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("unsupported");
    expect(inserts.event_inbox_log).toHaveLength(1);
    expect(
      (inserts.event_inbox_log[0] as { status: string }).status
    ).toBe("rejected");
  });

  it("captures handler exceptions as error", async () => {
    mocks.onCallAudited.mockRejectedValueOnce(new Error("boom"));
    const { client, inserts } = makeClient({ existing: null });
    const result = await dispatchInboxEvent(baseEnvelope, {
      client: client as never,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe("error");
    expect(result.reason).toContain("boom");
    expect(
      (inserts.event_inbox_log[0] as { status: string }).status
    ).toBe("error");
  });
});

describe("findExistingNodeForEvent", () => {
  it("returns node row when found", async () => {
    const { client } = makeClient({ existing: { id: "x-1" } });
    const out = await findExistingNodeForEvent(
      client as never,
      ORG,
      "evt-x"
    );
    expect(out?.id).toBe("x-1");
  });
  it("returns null when none found", async () => {
    const { client } = makeClient({ existing: null });
    const out = await findExistingNodeForEvent(
      client as never,
      ORG,
      "evt-x"
    );
    expect(out).toBeNull();
  });
});
