import { describe, expect, it, vi } from "vitest";
import {
  MONTHLY_TOKEN_CAP,
  SOFT_WARN_RATIO,
  TokenBudgetExceededError,
  checkBudget,
  currentMonthTokens,
} from "@/lib/ai/budget";

const ORG = "11111111-2222-4333-8444-555555555555";

function makeLedgerClient(rows: Array<{ tokens_in: number; tokens_out: number }>) {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    gte: vi.fn(() => Promise.resolve({ data: rows, error: null })),
  };
  return {
    from: vi.fn((table: string) => {
      if (table === "token_usage_ledger") return chain;
      throw new Error(`Unexpected table ${table}`);
    }),
  };
}

describe("MONTHLY_TOKEN_CAP / SOFT_WARN_RATIO", () => {
  it("are sensible defaults for V0", () => {
    expect(MONTHLY_TOKEN_CAP).toBe(100_000);
    expect(SOFT_WARN_RATIO).toBe(0.8);
  });
});

describe("currentMonthTokens", () => {
  it("returns 0 for an empty ledger", async () => {
    const c = makeLedgerClient([]);
    expect(await currentMonthTokens(ORG, c as never)).toBe(0);
  });

  it("sums tokens_in + tokens_out across rows", async () => {
    const c = makeLedgerClient([
      { tokens_in: 100, tokens_out: 50 },
      { tokens_in: 200, tokens_out: 0 },
    ]);
    expect(await currentMonthTokens(ORG, c as never)).toBe(350);
  });

  it("treats null/undefined fields as 0", async () => {
    const c = makeLedgerClient([
      { tokens_in: undefined as unknown as number, tokens_out: 10 },
      { tokens_in: 5, tokens_out: null as unknown as number },
    ]);
    expect(await currentMonthTokens(ORG, c as never)).toBe(15);
  });

  it("propagates DB errors", async () => {
    const errChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn(() => Promise.resolve({ data: null, error: { message: "boom" } })),
    };
    const c = { from: vi.fn(() => errChain) };
    await expect(currentMonthTokens(ORG, c as never)).rejects.toThrow();
  });
});

describe("checkBudget", () => {
  it("ok when below soft-warn threshold", async () => {
    const c = makeLedgerClient([{ tokens_in: 1000, tokens_out: 0 }]);
    const r = await checkBudget(ORG, 100, c as never);
    expect(r.kind).toBe("ok");
  });

  it("warn at exactly 80% of cap", async () => {
    const used = MONTHLY_TOKEN_CAP * 0.8;
    const c = makeLedgerClient([{ tokens_in: used, tokens_out: 0 }]);
    const r = await checkBudget(ORG, 0, c as never);
    expect(r.kind).toBe("warn");
    if (r.kind === "warn") {
      expect(r.ratio).toBeGreaterThanOrEqual(0.8);
    }
  });

  it("warn when projected (used + estimated) crosses 80%", async () => {
    const used = MONTHLY_TOKEN_CAP * 0.7;
    const c = makeLedgerClient([{ tokens_in: used, tokens_out: 0 }]);
    const r = await checkBudget(ORG, MONTHLY_TOKEN_CAP * 0.15, c as never);
    expect(r.kind).toBe("warn");
  });

  it("exceeded at exactly 100% of cap", async () => {
    const c = makeLedgerClient([
      { tokens_in: MONTHLY_TOKEN_CAP, tokens_out: 0 },
    ]);
    const r = await checkBudget(ORG, 0, c as never);
    expect(r.kind).toBe("exceeded");
    if (r.kind === "exceeded") {
      expect(r.used).toBe(MONTHLY_TOKEN_CAP);
      expect(r.cap).toBe(MONTHLY_TOKEN_CAP);
    }
  });

  it("exceeded when projected (used + estimated) crosses 100%", async () => {
    const c = makeLedgerClient([
      { tokens_in: MONTHLY_TOKEN_CAP * 0.95, tokens_out: 0 },
    ]);
    const r = await checkBudget(ORG, MONTHLY_TOKEN_CAP * 0.1, c as never);
    expect(r.kind).toBe("exceeded");
  });

  it("clamps negative estimated_tokens to 0", async () => {
    const c = makeLedgerClient([{ tokens_in: 0, tokens_out: 0 }]);
    const r = await checkBudget(ORG, -50, c as never);
    expect(r.kind).toBe("ok");
  });
});

describe("TokenBudgetExceededError", () => {
  it("carries org/used/cap context for audit", () => {
    const e = new TokenBudgetExceededError(ORG, 200, 100);
    expect(e.organization_id).toBe(ORG);
    expect(e.used).toBe(200);
    expect(e.cap).toBe(100);
    expect(e.message).toContain(ORG);
  });
});
