import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  getSecret,
  _clearSecretCacheForTests,
} from "@/lib/secrets/getSecret";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  _clearSecretCacheForTests();
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.WHATSAPP_WEBHOOK_SECRET;
  delete process.env.BUILTRIX_EVENT_INBOX_SECRET;
});
afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

function dbClient(opts: { row?: { value: string } | null }) {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    maybeSingle: vi.fn(() =>
      Promise.resolve({ data: opts.row ?? null, error: null })
    ),
  };
  return {
    from: vi.fn(() => chain),
  } as never;
}

describe("getSecret", () => {
  it("returns the DB value when present (DB > env)", async () => {
    process.env.ANTHROPIC_API_KEY = "env-value";
    const c = dbClient({ row: { value: "db-value" } });
    const v = await getSecret("anthropic_api_key", c);
    expect(v).toBe("db-value");
  });

  it("falls back to env when DB has no row", async () => {
    process.env.OPENAI_API_KEY = "env-value";
    const c = dbClient({ row: null });
    const v = await getSecret("openai_api_key", c);
    expect(v).toBe("env-value");
  });

  it("returns null when neither DB nor env has a value", async () => {
    const c = dbClient({ row: null });
    const v = await getSecret("whatsapp_webhook_secret", c);
    expect(v).toBeNull();
  });

  it("ignores empty env strings (treats as not-set)", async () => {
    process.env.BUILTRIX_EVENT_INBOX_SECRET = "";
    const c = dbClient({ row: null });
    const v = await getSecret("builtrix_event_inbox_secret", c);
    expect(v).toBeNull();
  });

  it("caches the resolved value across calls (single DB hit)", async () => {
    const c = dbClient({ row: { value: "db-value" } });
    const v1 = await getSecret("anthropic_api_key", c);
    const v2 = await getSecret("anthropic_api_key", c);
    expect(v1).toBe("db-value");
    expect(v2).toBe("db-value");
    // The chain's maybeSingle should have been called only once
    // because the second call hits the in-memory cache.
    expect((c as { from: ReturnType<typeof vi.fn> }).from).toHaveBeenCalledTimes(1);
  });
});
