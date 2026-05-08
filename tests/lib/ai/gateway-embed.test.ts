import { describe, expect, it, vi } from "vitest";
import { embed } from "@/lib/ai/gateway";
import { MONTHLY_TOKEN_CAP, TokenBudgetExceededError } from "@/lib/ai/budget";
import type { ProviderEmbedResult } from "@/lib/ai/types";

const ORG = "11111111-2222-4333-8444-555555555555";

function makeLedgerClient(rows: Array<{ tokens_in: number; tokens_out: number }> = []) {
  const inserted: Record<string, unknown>[] = [];
  const selectChain = {
    select: vi.fn(() => selectChain),
    eq: vi.fn(() => selectChain),
    gte: vi.fn(() => Promise.resolve({ data: rows, error: null })),
  };
  const client = {
    from: vi.fn((_table: string) => ({
      ...selectChain,
      insert: vi.fn((row: Record<string, unknown>) => {
        inserted.push(row);
        return Promise.resolve({ error: null });
      }),
    })),
  };
  return { client, inserted };
}

const sampleVector = Array.from({ length: 1536 }, (_, i) => i / 1536);

const okEmbed: () => Promise<ProviderEmbedResult> = async () => ({
  ok: true,
  vector: sampleVector,
  model_used: "text-embedding-3-small",
  tokens_in: 5,
});

const rateLimitedEmbed: () => Promise<ProviderEmbedResult> = async () => ({
  ok: false,
  error: "rate_limit",
  message: "429",
});

const parseFailedEmbed: () => Promise<ProviderEmbedResult> = async () => ({
  ok: false,
  error: "parse",
  message: "no vector",
});

describe("gateway.embed", () => {
  it("happy path: returns vector + writes ok ledger row", async () => {
    const t = makeLedgerClient();
    const r = await embed(
      { text: "hello", organization_id: ORG },
      { embed: okEmbed, client: t.client as never },
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.vector).toHaveLength(1536);
      expect(r.model_used).toBe("text-embedding-3-small");
    }
    expect(t.inserted).toHaveLength(1);
    expect(t.inserted[0]!.status).toBe("ok");
    expect(t.inserted[0]!.call_kind).toBe("embed");
  });

  it("propagates rate_limit as typed error + writes error row", async () => {
    const t = makeLedgerClient();
    const r = await embed(
      { text: "x", organization_id: ORG },
      { embed: rateLimitedEmbed, client: t.client as never },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("rate_limit");
    expect(t.inserted[0]!.status).toBe("error");
    expect(t.inserted[0]!.error_code).toBe("rate_limit");
  });

  it("propagates parse error", async () => {
    const t = makeLedgerClient();
    const r = await embed(
      { text: "x", organization_id: ORG },
      { embed: parseFailedEmbed, client: t.client as never },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("parse");
  });

  it("budget exceeded → TokenBudgetExceededError + no provider call", async () => {
    const t = makeLedgerClient([
      { tokens_in: MONTHLY_TOKEN_CAP, tokens_out: 0 },
    ]);
    let calls = 0;
    await expect(
      embed(
        { text: "x", organization_id: ORG },
        {
          embed: async () => {
            calls += 1;
            return await okEmbed();
          },
          client: t.client as never,
        },
      ),
    ).rejects.toThrow(TokenBudgetExceededError);
    expect(calls).toBe(0);
    expect(t.inserted[0]!.error_code).toBe("budget");
  });

  it("warn at 80% — result.warnings includes budget-80", async () => {
    const t = makeLedgerClient([
      { tokens_in: MONTHLY_TOKEN_CAP * 0.8, tokens_out: 0 },
    ]);
    const r = await embed(
      { text: "x", organization_id: ORG },
      { embed: okEmbed, client: t.client as never },
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.warnings).toContain("budget-80");
  });

  it("organization_id=null skips budget check + records null on ledger", async () => {
    const t = makeLedgerClient();
    const r = await embed(
      { text: "x", organization_id: null },
      { embed: okEmbed, client: t.client as never },
    );
    expect(r.ok).toBe(true);
    expect(t.inserted[0]!.organization_id).toBeNull();
  });
});
