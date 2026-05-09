import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const mocks = vi.hoisted(() => ({
  fromImpl: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({
    from: mocks.fromImpl,
  }),
}));

import { listSecretStatus, upsertSecret } from "@/lib/secrets/queries";

beforeEach(() => {
  mocks.fromImpl.mockReset();
});

const ENV_BACKUP = { ...process.env };
afterEach(() => {
  process.env = { ...ENV_BACKUP };
});

describe("listSecretStatus", () => {
  it("returns all kinds with source=none when DB empty + no env vars", async () => {
    mocks.fromImpl.mockReturnValue({
      select: () => Promise.resolve({ data: [], error: null }),
    });
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.WHATSAPP_WEBHOOK_SECRET;
    delete process.env.BUILTRIX_EVENT_INBOX_SECRET;

    const result = await listSecretStatus();
    expect(result).toHaveLength(4);
    expect(result.every((r) => r.source === "none")).toBe(true);
    expect(result.every((r) => r.is_set === false)).toBe(true);
    expect(result.every((r) => r.last4 === null)).toBe(true);
  });

  it("returns source=env with last4 of env value when DB empty but env set", async () => {
    mocks.fromImpl.mockReturnValue({
      select: () => Promise.resolve({ data: [], error: null }),
    });
    process.env.ANTHROPIC_API_KEY = "sk-ant-XXXXabcd";
    process.env.OPENAI_API_KEY = "";

    const result = await listSecretStatus();
    const ant = result.find((r) => r.kind === "anthropic_api_key");
    expect(ant).toMatchObject({
      is_set: true,
      source: "env",
      last4: "abcd",
      rotated_at: null,
    });
    const oai = result.find((r) => r.kind === "openai_api_key");
    expect(oai?.source).toBe("none");
  });

  it("prefers DB row over env when both are set (source=db)", async () => {
    mocks.fromImpl.mockReturnValue({
      select: () =>
        Promise.resolve({
          data: [
            {
              kind: "anthropic_api_key",
              last4: "1111",
              rotated_at: "2026-05-09T00:00:00Z",
            },
          ],
          error: null,
        }),
    });
    process.env.ANTHROPIC_API_KEY = "sk-ant-zzzz";

    const result = await listSecretStatus();
    const ant = result.find((r) => r.kind === "anthropic_api_key");
    expect(ant).toMatchObject({
      source: "db",
      last4: "1111",
      rotated_at: "2026-05-09T00:00:00Z",
      is_set: true,
    });
  });

  it("treats DB error as empty (no throw)", async () => {
    mocks.fromImpl.mockReturnValue({
      select: () =>
        Promise.resolve({ data: null, error: { message: "boom" } }),
    });
    delete process.env.ANTHROPIC_API_KEY;

    const result = await listSecretStatus();
    expect(result.every((r) => r.source !== "db")).toBe(true);
  });
});

describe("upsertSecret", () => {
  it("rejects values shorter than 8 chars", async () => {
    await expect(
      upsertSecret({
        kind: "anthropic_api_key",
        value: "short",
        actor_id: "u1",
      }),
    ).rejects.toThrow(/at least 8/);
    expect(mocks.fromImpl).not.toHaveBeenCalled();
  });

  it("upserts and writes audit row on success", async () => {
    const upsertMock = vi.fn(() => Promise.resolve({ error: null }));
    const auditInsertMock = vi.fn(() => Promise.resolve({ error: null }));
    mocks.fromImpl.mockImplementation((table: string) => {
      if (table === "platform_secrets") return { upsert: upsertMock };
      if (table === "audit_log") return { insert: auditInsertMock };
      throw new Error(`unexpected table ${table}`);
    });

    await upsertSecret({
      kind: "anthropic_api_key",
      value: "sk-ant-this-is-secret",
      actor_id: "actor-uuid",
    });

    expect(upsertMock).toHaveBeenCalledTimes(1);
    const upsertPayload = upsertMock.mock.calls[0][0];
    expect(upsertPayload.kind).toBe("anthropic_api_key");
    expect(upsertPayload.last4).toBe("cret");
    expect(upsertPayload.created_by).toBe("actor-uuid");

    expect(auditInsertMock).toHaveBeenCalledTimes(1);
    const auditPayload = auditInsertMock.mock.calls[0][0];
    expect(auditPayload.action).toBe("platform_secret_rotated");
    expect(auditPayload.diff.kind).toBe("anthropic_api_key");
    // Audit must NOT carry the raw value or its last4.
    expect(JSON.stringify(auditPayload.diff)).not.toContain("cret");
  });

  it("throws when the upsert errors", async () => {
    mocks.fromImpl.mockImplementation((table: string) => {
      if (table === "platform_secrets")
        return {
          upsert: () =>
            Promise.resolve({ error: { message: "constraint violation" } }),
        };
      throw new Error(`unexpected table ${table}`);
    });

    await expect(
      upsertSecret({
        kind: "openai_api_key",
        value: "0123456789abcdef",
        actor_id: "actor",
      }),
    ).rejects.toThrow(/constraint violation/);
  });
});
