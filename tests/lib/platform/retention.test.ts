import { describe, expect, it, vi } from "vitest";
import {
  PRUNE_TABLES,
  pruneAll,
  pruneOne,
  type PruneEntry,
} from "@/lib/platform/retention";

vi.mock("@/lib/platform/flags", () => ({
  getFlag: async (key: string, fallback: unknown) => {
    if (key === "retention_min_floor") return 100;
    if (key === "retention_days_api_audit_log") return 90;
    if (key === "retention_days_event_inbox_log") return 30;
    if (key === "retention_days_webhook_deliveries") return 60;
    return fallback;
  },
}));

function makeClient(opts: {
  rpcResults?: Partial<
    Record<string, { scanned: number; deleted: number }[] | null>
  >;
  rpcErrors?: Partial<Record<string, string>>;
}) {
  const calls: { name: string; args: unknown }[] = [];
  return {
    calls,
    client: {
      rpc: vi.fn(async (name: string, args: unknown) => {
        calls.push({ name, args });
        if (opts.rpcErrors?.[name]) {
          return { data: null, error: { message: opts.rpcErrors[name] } };
        }
        // Distinguish "not configured" (-> fallback) from "explicit null".
        const hasOverride =
          opts.rpcResults !== undefined && name in (opts.rpcResults ?? {});
        const result = opts.rpcResults?.[name];
        return {
          data: hasOverride ? result : [{ scanned: 1000, deleted: 100 }],
          error: null,
        };
      }),
    },
  };
}

describe("retention.pruneOne", () => {
  it("calls the matching RPC and shapes the response", async () => {
    const env = makeClient({
      rpcResults: {
        prune_api_audit_log: [{ scanned: 5000, deleted: 1234 }],
      },
    });
    const r = await pruneOne(
      "api_audit_log",
      90,
      100,
      env.client as never
    );
    expect(r).toEqual({
      table: "api_audit_log",
      scanned: 5000,
      deleted: 1234,
      retention_days: 90,
    });
    expect(env.calls[0].name).toBe("prune_api_audit_log");
    expect(env.calls[0].args).toEqual({ retention_days: 90, min_floor: 100 });
  });

  it("captures rpc error in PruneEntry.error", async () => {
    const env = makeClient({
      rpcErrors: { prune_event_inbox_log: "permission denied" },
    });
    const r = await pruneOne(
      "event_inbox_log",
      30,
      100,
      env.client as never
    );
    expect(r.error).toBe("permission denied");
    expect(r.deleted).toBe(0);
  });

  it("handles RPC returning null (no rows)", async () => {
    const env = makeClient({
      rpcResults: { prune_webhook_deliveries: null },
    });
    const r = await pruneOne(
      "webhook_deliveries",
      60,
      100,
      env.client as never
    );
    expect(r.error).toBe("no_rows_returned");
  });

  it("falls back to deleted=0 when min-floor short-circuits", async () => {
    const env = makeClient({
      rpcResults: { prune_api_audit_log: [{ scanned: 50, deleted: 0 }] },
    });
    const r = await pruneOne(
      "api_audit_log",
      90,
      100,
      env.client as never
    );
    expect(r.scanned).toBe(50);
    expect(r.deleted).toBe(0);
  });
});

describe("retention.pruneAll", () => {
  it("invokes all 3 tables in order, threading retention_days from flags", async () => {
    const env = makeClient({
      rpcResults: {
        prune_api_audit_log: [{ scanned: 1000, deleted: 50 }],
        prune_event_inbox_log: [{ scanned: 500, deleted: 25 }],
        prune_webhook_deliveries: [{ scanned: 800, deleted: 40 }],
      },
    });
    const out: PruneEntry[] = await pruneAll(env.client as never);
    expect(out).toHaveLength(3);
    expect(out.map((r) => r.table)).toEqual([...PRUNE_TABLES]);
    expect(out[0]).toMatchObject({
      table: "api_audit_log",
      scanned: 1000,
      deleted: 50,
      retention_days: 90,
    });
    expect(out[1]).toMatchObject({
      table: "event_inbox_log",
      retention_days: 30,
    });
    expect(out[2]).toMatchObject({
      table: "webhook_deliveries",
      retention_days: 60,
    });
  });

  it("aggregates errors per table without aborting the run", async () => {
    const env = makeClient({
      rpcResults: {
        prune_api_audit_log: [{ scanned: 100, deleted: 10 }],
        prune_webhook_deliveries: [{ scanned: 200, deleted: 20 }],
      },
      rpcErrors: { prune_event_inbox_log: "trigger_disable_blocked" },
    });
    const out = await pruneAll(env.client as never);
    expect(out).toHaveLength(3);
    expect(out[0].deleted).toBe(10);
    expect(out[1].error).toBe("trigger_disable_blocked");
    expect(out[2].deleted).toBe(20);
  });

  it("passes the min-floor flag value to each RPC", async () => {
    const env = makeClient({});
    await pruneAll(env.client as never);
    expect(env.calls).toHaveLength(3);
    for (const call of env.calls) {
      expect((call.args as { min_floor: number }).min_floor).toBe(100);
    }
  });
});
