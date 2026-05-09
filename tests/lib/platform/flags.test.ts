import { describe, expect, it, vi } from "vitest";
import { getFlag, listFlags, setFlag } from "@/lib/platform/flags";

const ACTOR = "99999999-8888-4777-8666-555555555555";

function makeReadClient(value: unknown | null) {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    order: vi.fn(() =>
      Promise.resolve({
        data:
          value === null
            ? []
            : [
                {
                  key: "force_mfa",
                  value,
                  description: "test",
                  updated_at: "2026-05-09T00:00:00Z",
                },
              ],
        error: null,
      })
    ),
    maybeSingle: vi.fn(() =>
      Promise.resolve({ data: value === null ? null : { value }, error: null })
    ),
  };
  return { from: vi.fn(() => chain) };
}

describe("getFlag", () => {
  it("returns boolean value when set", async () => {
    const client = makeReadClient(true);
    const v = await getFlag("force_mfa", false, client as never);
    expect(v).toBe(true);
  });

  it("returns numeric value when set", async () => {
    const client = makeReadClient(5_000_000);
    const v = await getFlag(
      "default_token_budget_per_org_per_month",
      0,
      client as never
    );
    expect(v).toBe(5_000_000);
  });

  it("returns string value when set", async () => {
    const client = makeReadClient("hello");
    const v = await getFlag("custom_string", "default", client as never);
    expect(v).toBe("hello");
  });

  it("returns fallback when key missing", async () => {
    const client = makeReadClient(null);
    const v = await getFlag("force_mfa", false, client as never);
    expect(v).toBe(false);
  });

  it("returns fallback when stored value is non-primitive", async () => {
    const client = makeReadClient({ nested: true });
    const v = await getFlag("force_mfa", false, client as never);
    expect(v).toBe(false);
  });
});

describe("listFlags", () => {
  it("returns rows with primitive values", async () => {
    const client = makeReadClient(true);
    const rows = await listFlags(client as never);
    expect(rows).toHaveLength(1);
    expect(rows[0].key).toBe("force_mfa");
    expect(rows[0].value).toBe(true);
  });
});

describe("setFlag", () => {
  function makeWriteClient(opts: { upsert_error?: boolean } = {}) {
    const upserts: unknown[] = [];
    const audits: unknown[] = [];
    const flagsChain = {
      upsert: vi.fn((row: unknown) => {
        upserts.push(row);
        return Promise.resolve({
          error: opts.upsert_error ? new Error("db") : null,
        });
      }),
    };
    const auditChain = {
      insert: vi.fn((row: unknown) => {
        audits.push(row);
        return Promise.resolve({ error: null });
      }),
    };
    return {
      upserts,
      audits,
      client: {
        from: vi.fn((table: string) => {
          if (table === "platform_flags") return flagsChain;
          if (table === "audit_log") return auditChain;
          throw new Error(`unexpected ${table}`);
        }),
      },
    };
  }

  it("upserts + audits", async () => {
    const env = makeWriteClient();
    const r = await setFlag("force_mfa", true, ACTOR, env.client as never);
    expect(r.ok).toBe(true);
    expect(env.upserts).toHaveLength(1);
    expect((env.upserts[0] as { key: string }).key).toBe("force_mfa");
    expect((env.audits[0] as { action: string }).action).toBe(
      "platform_flag_set"
    );
  });

  it("rejects non-primitive values", async () => {
    const env = makeWriteClient();
    const r = await setFlag(
      "force_mfa",
      { nested: true } as never,
      ACTOR,
      env.client as never
    );
    expect(r.ok).toBe(false);
    expect(env.upserts).toHaveLength(0);
  });

  it("propagates db errors", async () => {
    const env = makeWriteClient({ upsert_error: true });
    const r = await setFlag("force_mfa", true, ACTOR, env.client as never);
    expect(r.ok).toBe(false);
  });
});
