import { describe, expect, it, vi } from "vitest";
import { emitEvent, isSubscribed } from "@/lib/webhooks/emit";

describe("isSubscribed", () => {
  it.each([
    [["lead.created"], "lead.created", true],
    [["lead.updated"], "lead.created", false],
    [["*"], "lead.created", true],
    [["lead.*"], "lead.created", true],
    [["lead.*"], "deal.created", false],
    [["lead.*", "deal.booked"], "deal.booked", true],
    [[], "lead.created", false],
    ["not-an-array", "lead.created", false],
    [[null, 42, "lead.created"], "lead.created", true],
    [[null, 42], "lead.created", false],
  ])("subscribed=%s kind=%s -> %s", (subs, kind, expected) => {
    expect(isSubscribed(subs, kind)).toBe(expected);
  });
});

describe("emitEvent", () => {
  function makeClient(opts: {
    endpoints: Array<{ id: string; events_subscribed: unknown }>;
    insert_ok?: boolean;
  }) {
    const inserts: unknown[] = [];
    const insert_ok = opts.insert_ok ?? true;
    return {
      state: { inserts },
      from: vi.fn((table: string) => {
        if (table === "webhook_endpoints") {
          // 4-deep chain: select.eq.eq.is.is
          const tail = {
            is: vi.fn(() => Promise.resolve({ data: opts.endpoints, error: null })),
          };
          const isWrap = { is: vi.fn(() => tail) };
          const eq2 = { eq: vi.fn(() => isWrap), is: vi.fn(() => tail) };
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => eq2),
            })),
          };
        }
        if (table === "webhook_deliveries") {
          return {
            insert: vi.fn((row: unknown) => ({
              select: vi.fn(() => ({
                single: vi.fn(() => {
                  inserts.push(row);
                  return Promise.resolve(
                    insert_ok
                      ? { data: { id: `del-${inserts.length}` }, error: null }
                      : { data: null, error: { message: "boom-insert" } },
                  );
                }),
              })),
            })),
          };
        }
        return { select: vi.fn() };
      }),
    };
  }

  it("fans out to every subscribed endpoint and returns per-endpoint summary", async () => {
    const client = makeClient({
      endpoints: [
        { id: "e1", events_subscribed: ["lead.created"] },
        { id: "e2", events_subscribed: ["lead.*"] },
        { id: "e3", events_subscribed: ["deal.booked"] }, // not subscribed
        { id: "e4", events_subscribed: ["*"] },
      ],
    });
    const r = await emitEvent("org-1", "lead.created", { lead_id: "l1" }, client as never);
    expect(r.total_endpoints).toBe(4);
    expect(r.matched_endpoints).toBe(3);
    expect(r.enqueued).toBe(3);
    expect(r.per_endpoint.map((p) => p.endpoint_id).sort()).toEqual(["e1", "e2", "e4"]);
    expect(client.state.inserts).toHaveLength(3);
    expect(client.state.inserts[0]).toMatchObject({
      organization_id: "org-1",
      event_kind: "lead.created",
      payload: { lead_id: "l1" },
      status: "pending",
    });
  });

  it("returns 0 enqueued when no endpoints match", async () => {
    const client = makeClient({
      endpoints: [{ id: "e1", events_subscribed: ["deal.booked"] }],
    });
    const r = await emitEvent("org-1", "lead.created", {}, client as never);
    expect(r.matched_endpoints).toBe(0);
    expect(r.enqueued).toBe(0);
    expect(r.per_endpoint).toEqual([]);
  });

  it("captures insert errors per endpoint without aborting", async () => {
    const client = makeClient({
      endpoints: [
        { id: "e1", events_subscribed: ["lead.created"] },
        { id: "e2", events_subscribed: ["lead.created"] },
      ],
      insert_ok: false,
    });
    const r = await emitEvent("org-1", "lead.created", {}, client as never);
    expect(r.matched_endpoints).toBe(2);
    expect(r.enqueued).toBe(0);
    expect(r.per_endpoint.every((p) => p.error === "boom-insert")).toBe(true);
  });
});
