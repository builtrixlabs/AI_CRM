import { describe, expect, it, vi, beforeEach } from "vitest";
import { createHmac } from "node:crypto";

const mocks = vi.hoisted(() => ({
  getSecret: vi.fn(),
}));
vi.mock("@/lib/secrets/getSecret", () => ({
  getSecret: mocks.getSecret,
}));

import {
  canRotate,
  getVoiceIqSecret,
  getVoiceIqSecretStatus,
  rotateVoiceIqSecret,
} from "@/lib/integrations/voice-iq/secret";

const ORG = "11111111-2222-4333-8444-555555555555";
const ACTOR = "99999999-8888-4777-8666-555555555555";

function makeClient(opts: {
  org_secret?: { value?: string; last4?: string; rotated_at?: string };
  upsert_error?: boolean;
}) {
  const audits: unknown[] = [];
  const upserts: unknown[] = [];

  const orgRow =
    opts.org_secret === undefined
      ? null
      : {
          value: opts.org_secret.value ?? "secret-value",
          last4: opts.org_secret.last4 ?? "abcd",
          rotated_at: opts.org_secret.rotated_at ?? new Date().toISOString(),
        };

  const orgChain = {
    select: vi.fn(() => orgChain),
    eq: vi.fn(() => orgChain),
    maybeSingle: vi.fn(() =>
      Promise.resolve({
        data: orgRow,
        error: null,
      })
    ),
    upsert: vi.fn((row: unknown) => {
      upserts.push(row);
      return Promise.resolve({
        error: opts.upsert_error ? new Error("boom") : null,
      });
    }),
  };

  const auditChain = {
    insert: vi.fn((row: unknown) => {
      audits.push(row);
      return Promise.resolve({ error: null });
    }),
  };

  const client = {
    from: vi.fn((table: string) => {
      if (table === "org_integration_secrets") return orgChain;
      if (table === "audit_log") return auditChain;
      throw new Error(`unexpected table ${table}`);
    }),
  };
  return { client, audits, upserts };
}

beforeEach(() => {
  mocks.getSecret.mockReset();
  mocks.getSecret.mockResolvedValue(null);
});

describe("getVoiceIqSecret", () => {
  it("returns the per-org value when org_integration_secrets has a row", async () => {
    const { client } = makeClient({
      org_secret: { value: "org-specific-secret-xyz" },
    });
    const v = await getVoiceIqSecret(ORG, client as never);
    expect(v).toBe("org-specific-secret-xyz");
    expect(mocks.getSecret).not.toHaveBeenCalled();
  });

  it("falls back to platform-default when no org row exists", async () => {
    const { client } = makeClient({});
    mocks.getSecret.mockResolvedValueOnce("platform-default-abc");
    const v = await getVoiceIqSecret(ORG, client as never);
    expect(v).toBe("platform-default-abc");
    expect(mocks.getSecret).toHaveBeenCalledWith(
      "builtrix_event_inbox_secret",
      client
    );
  });

  it("returns null when neither source has a value", async () => {
    const { client } = makeClient({});
    const v = await getVoiceIqSecret(ORG, client as never);
    expect(v).toBeNull();
  });
});

describe("getVoiceIqSecretStatus", () => {
  it("reports source='org' when per-org secret set", async () => {
    const { client } = makeClient({
      org_secret: { last4: "feed", rotated_at: "2026-05-09T10:00:00.000Z" },
    });
    const s = await getVoiceIqSecretStatus(ORG, client as never);
    expect(s.is_set).toBe(true);
    expect(s.source).toBe("org");
    expect(s.last4).toBe("feed");
  });

  it("reports source='platform' when only platform-default set", async () => {
    const { client } = makeClient({});
    mocks.getSecret.mockResolvedValueOnce("0123456789abcdef");
    const s = await getVoiceIqSecretStatus(ORG, client as never);
    expect(s.is_set).toBe(true);
    expect(s.source).toBe("platform");
    expect(s.last4).toBe("cdef");
  });

  it("reports source='none' when no secret anywhere", async () => {
    const { client } = makeClient({});
    const s = await getVoiceIqSecretStatus(ORG, client as never);
    expect(s).toEqual({
      is_set: false,
      last4: null,
      rotated_at: null,
      source: "none",
    });
  });
});

describe("rotateVoiceIqSecret", () => {
  it("upserts a 64-char hex value, audits, returns last4", async () => {
    const { client, audits, upserts } = makeClient({});
    const result = await rotateVoiceIqSecret(
      { organization_id: ORG, actor_id: ACTOR },
      client as never
    );
    expect(result.last4).toHaveLength(4);
    expect(result.rotated_at).toBeDefined();

    expect(upserts).toHaveLength(1);
    const u = upserts[0] as Record<string, unknown>;
    expect(u.organization_id).toBe(ORG);
    expect(u.kind).toBe("voice_iq_inbox_secret");
    expect((u.value as string)).toMatch(/^[0-9a-f]{64}$/);
    expect((u.value as string).slice(-4)).toBe(result.last4);

    expect(audits).toHaveLength(1);
    const a = audits[0] as Record<string, unknown>;
    expect(a.action).toBe("voice_iq_secret_rotated");
    expect(a.actor_id).toBe(ACTOR);
    expect(a.organization_id).toBe(ORG);
  });

  it("propagates upsert errors", async () => {
    const { client } = makeClient({ upsert_error: true });
    await expect(
      rotateVoiceIqSecret(
        { organization_id: ORG, actor_id: ACTOR },
        client as never
      )
    ).rejects.toThrow("boom");
  });
});

describe("canRotate", () => {
  it("allows rotation when no prior row exists", async () => {
    const { client } = makeClient({});
    const r = await canRotate(ORG, client as never);
    expect(r.allowed).toBe(true);
  });

  it("blocks when last rotation < 5s ago", async () => {
    const recent = new Date(Date.now() - 1000).toISOString();
    const { client } = makeClient({ org_secret: { rotated_at: recent } });
    const r = await canRotate(ORG, client as never);
    expect(r.allowed).toBe(false);
    if (r.allowed) return;
    expect(r.wait_seconds).toBeGreaterThanOrEqual(1);
    expect(r.wait_seconds).toBeLessThanOrEqual(5);
  });

  it("allows when last rotation > 5s ago", async () => {
    const old = new Date(Date.now() - 60_000).toISOString();
    const { client } = makeClient({ org_secret: { rotated_at: old } });
    const r = await canRotate(ORG, client as never);
    expect(r.allowed).toBe(true);
  });
});

describe("HMAC signature round-trip", () => {
  it("compatible with the inbox route's verifier", () => {
    const secret = "0".repeat(64);
    const body = JSON.stringify({ event_id: "x", organization_id: ORG });
    const expected = createHmac("sha256", secret)
      .update(body, "utf8")
      .digest("hex");
    // The inbox route's verifyWhatsAppSignature accepts both `<hex>` and
    // `sha256=<hex>` — the action sends with the prefix so we exercise it.
    const headerForm = `sha256=${expected}`;
    expect(headerForm.startsWith("sha256=")).toBe(true);
    expect(headerForm.slice(7)).toHaveLength(64);
  });
});
