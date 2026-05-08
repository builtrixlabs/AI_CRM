import { describe, expect, it, vi, beforeEach } from "vitest";
import { complete } from "@/lib/ai/gateway";
import { MONTHLY_TOKEN_CAP, TokenBudgetExceededError } from "@/lib/ai/budget";
import type {
  ProviderCompleteResult,
} from "@/lib/ai/types";

const ORG = "11111111-2222-4333-8444-555555555555";

function makeLedgerClient(rows: Array<{ tokens_in: number; tokens_out: number }> = []) {
  const inserted: Record<string, unknown>[] = [];
  const selectChain = {
    select: vi.fn(() => selectChain),
    eq: vi.fn(() => selectChain),
    gte: vi.fn(() => Promise.resolve({ data: rows, error: null })),
  };
  const client = {
    from: vi.fn((table: string) => {
      if (table === "token_usage_ledger") {
        return {
          ...selectChain,
          insert: vi.fn((row: Record<string, unknown>) => {
            inserted.push(row);
            return Promise.resolve({ error: null });
          }),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    }),
  };
  return { client, inserted };
}

const okAnthropic: () => Promise<ProviderCompleteResult> = async () => ({
  ok: true,
  text: "anthropic ok",
  model_used: "claude-sonnet-4-6",
  tokens_in: 50,
  tokens_out: 25,
});

const okOpenAI: () => Promise<ProviderCompleteResult> = async () => ({
  ok: true,
  text: "openai ok",
  model_used: "gpt-4o-mini",
  tokens_in: 60,
  tokens_out: 30,
});

const rateLimitedAnthropic: () => Promise<ProviderCompleteResult> = async () => ({
  ok: false,
  error: "rate_limit",
  message: "429 from Anthropic",
});

const networkAnthropic: () => Promise<ProviderCompleteResult> = async () => ({
  ok: false,
  error: "network",
  message: "fetch failed",
});

const authFailedAnthropic: () => Promise<ProviderCompleteResult> = async () => ({
  ok: false,
  error: "auth",
  message: "401",
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("gateway.complete — happy paths", () => {
  it("Anthropic primary success — returns shaped result + writes ledger 'ok'", async () => {
    const t = makeLedgerClient();
    const r = await complete(
      {
        prompt: "Hello",
        organization_id: ORG,
      },
      {
        anthropic: okAnthropic,
        openai: okOpenAI,
        client: t.client as never,
      },
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.text).toBe("anthropic ok");
      expect(r.model_used).toBe("claude-sonnet-4-6");
      expect(r.tokens_in).toBe(50);
      expect(r.tokens_out).toBe(25);
      expect(r.warnings).toBeUndefined();
    }
    expect(t.inserted).toHaveLength(1);
    expect(t.inserted[0]!.status).toBe("ok");
    expect(t.inserted[0]!.call_kind).toBe("complete");
  });

  it("model_pref='openai' → OpenAI primary", async () => {
    const t = makeLedgerClient();
    const r = await complete(
      {
        prompt: "Hi",
        organization_id: ORG,
        model_pref: "openai",
      },
      { anthropic: okAnthropic, openai: okOpenAI, client: t.client as never },
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.model_used).toBe("gpt-4o-mini");
  });

  it("warns at 80% — result.warnings includes budget-80", async () => {
    const t = makeLedgerClient([
      { tokens_in: MONTHLY_TOKEN_CAP * 0.8, tokens_out: 0 },
    ]);
    const r = await complete(
      { prompt: "x", organization_id: ORG },
      { anthropic: okAnthropic, openai: okOpenAI, client: t.client as never },
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.warnings).toContain("budget-80");
  });

  it("no organization_id — skips budget check, no ledger row tied to org", async () => {
    const t = makeLedgerClient();
    const r = await complete(
      { prompt: "x", organization_id: null },
      { anthropic: okAnthropic, openai: okOpenAI, client: t.client as never },
    );
    expect(r.ok).toBe(true);
    expect(t.inserted[0]!.organization_id).toBeNull();
  });
});

describe("gateway.complete — fallback paths", () => {
  it("falls back from Anthropic rate-limit to OpenAI; ledger records OpenAI's success", async () => {
    const t = makeLedgerClient();
    const r = await complete(
      { prompt: "x", organization_id: ORG },
      {
        anthropic: rateLimitedAnthropic,
        openai: okOpenAI,
        client: t.client as never,
      },
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.model_used).toBe("gpt-4o-mini");
    expect(t.inserted).toHaveLength(1);
    expect(t.inserted[0]!.status).toBe("ok");
    expect(t.inserted[0]!.model_used).toBe("gpt-4o-mini");
  });

  it("falls back from Anthropic network error to OpenAI", async () => {
    const t = makeLedgerClient();
    const r = await complete(
      { prompt: "x", organization_id: ORG },
      {
        anthropic: networkAnthropic,
        openai: okOpenAI,
        client: t.client as never,
      },
    );
    expect(r.ok).toBe(true);
  });

  it("does NOT fall back on auth error (non-transient)", async () => {
    const t = makeLedgerClient();
    const r = await complete(
      { prompt: "x", organization_id: ORG },
      {
        anthropic: authFailedAnthropic,
        openai: okOpenAI,
        client: t.client as never,
      },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("unknown"); // 'auth' maps to 'unknown' in user-facing
  });

  it("both providers fail → returns typed error + writes 'error' ledger row", async () => {
    const t = makeLedgerClient();
    const r = await complete(
      { prompt: "x", organization_id: ORG },
      {
        anthropic: rateLimitedAnthropic,
        openai: rateLimitedAnthropic,
        client: t.client as never,
      },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("rate_limit");
    expect(t.inserted).toHaveLength(1);
    expect(t.inserted[0]!.status).toBe("error");
    expect(t.inserted[0]!.error_code).toBe("rate_limit");
  });

  it("parse error from primary returns parse without fallback", async () => {
    const t = makeLedgerClient();
    const parseFail: () => Promise<ProviderCompleteResult> = async () => ({
      ok: false,
      error: "parse",
      message: "no text block",
    });
    const r = await complete(
      { prompt: "x", organization_id: ORG },
      { anthropic: parseFail, openai: okOpenAI, client: t.client as never },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("parse");
  });
});

describe("gateway.complete — budget enforcement", () => {
  it("throws TokenBudgetExceededError when org is at 100% — no provider call", async () => {
    const t = makeLedgerClient([
      { tokens_in: MONTHLY_TOKEN_CAP, tokens_out: 0 },
    ]);
    let providerCalls = 0;
    await expect(
      complete(
        { prompt: "x", organization_id: ORG },
        {
          anthropic: async () => {
            providerCalls += 1;
            return await okAnthropic();
          },
          openai: async () => {
            providerCalls += 1;
            return await okOpenAI();
          },
          client: t.client as never,
        },
      ),
    ).rejects.toThrow(TokenBudgetExceededError);
    expect(providerCalls).toBe(0);
    // The rejected call is recorded as 'error/budget' in the ledger.
    expect(t.inserted).toHaveLength(1);
    expect(t.inserted[0]!.status).toBe("error");
    expect(t.inserted[0]!.error_code).toBe("budget");
  });
});
