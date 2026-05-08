import { describe, expect, it, vi } from "vitest";
import { recordCall } from "@/lib/ai/ledger";

const ORG = "11111111-2222-4333-8444-555555555555";

function makeClient(insertResult: { error: { message: string } | null }) {
  const inserted: Record<string, unknown>[] = [];
  const client = {
    from: vi.fn((table: string) => {
      if (table !== "token_usage_ledger") {
        throw new Error(`Unexpected table ${table}`);
      }
      return {
        insert: vi.fn((row: Record<string, unknown>) => {
          inserted.push(row);
          return Promise.resolve(insertResult);
        }),
      };
    }),
  };
  return { client, inserted };
}

describe("recordCall", () => {
  it("inserts a successful call shape", async () => {
    const t = makeClient({ error: null });
    await recordCall(
      {
        organization_id: ORG,
        agent_id: null,
        request_id: "req-1",
        model_used: "claude-sonnet-4-6",
        call_kind: "complete",
        tokens_in: 200,
        tokens_out: 100,
        duration_ms: 543,
        status: "ok",
      },
      t.client as never,
    );
    expect(t.inserted).toHaveLength(1);
    const row = t.inserted[0]!;
    expect(row.organization_id).toBe(ORG);
    expect(row.request_id).toBe("req-1");
    expect(row.status).toBe("ok");
    expect(row.tokens_in).toBe(200);
    expect(row.tokens_out).toBe(100);
    expect(row.error_code).toBeNull();
  });

  it("records an error call shape", async () => {
    const t = makeClient({ error: null });
    await recordCall(
      {
        organization_id: ORG,
        request_id: "req-2",
        model_used: "claude-sonnet-4-6",
        call_kind: "complete",
        tokens_in: 0,
        tokens_out: 0,
        status: "error",
        error_code: "rate_limit",
      },
      t.client as never,
    );
    const row = t.inserted[0]!;
    expect(row.status).toBe("error");
    expect(row.error_code).toBe("rate_limit");
    expect(row.tokens_in).toBe(0);
  });

  it("propagates DB errors (gateway must surface ledger failures)", async () => {
    const t = makeClient({ error: { message: "DB down" } });
    await expect(
      recordCall(
        {
          organization_id: ORG,
          request_id: "req-x",
          model_used: "x",
          call_kind: "embed",
          tokens_in: 0,
          tokens_out: 0,
          status: "ok",
        },
        t.client as never,
      ),
    ).rejects.toThrow();
  });

  it("supports null organization_id (system-level call)", async () => {
    const t = makeClient({ error: null });
    await recordCall(
      {
        organization_id: null,
        request_id: "sys-1",
        model_used: "x",
        call_kind: "complete",
        tokens_in: 1,
        tokens_out: 1,
        status: "ok",
      },
      t.client as never,
    );
    expect(t.inserted[0]!.organization_id).toBeNull();
  });
});
