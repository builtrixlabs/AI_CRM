import { describe, expect, it, vi, afterEach } from "vitest";
import {
  defaultFreshnessMs,
  isDemoBypassActive,
  isMfaFresh,
  isSensitiveRoute,
  markMfaVerified,
} from "@/lib/auth/mfa";

const USER = "99999999-8888-4777-8666-555555555555";

vi.mock("@/lib/platform/flags", () => ({
  getFlag: vi.fn(async (_k: string, fallback: unknown) => fallback),
}));

afterEach(() => {
  delete process.env.MFA_DEMO_MODE;
  delete process.env.MFA_FRESHNESS_HOURS;
});

describe("isMfaFresh", () => {
  it("returns false for null verified_at", () => {
    expect(isMfaFresh(null)).toBe(false);
  });

  it("returns true within 8h window", () => {
    const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();
    expect(isMfaFresh(fiveHoursAgo)).toBe(true);
  });

  it("returns false outside 8h window", () => {
    const tenHoursAgo = new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString();
    expect(isMfaFresh(tenHoursAgo)).toBe(false);
  });

  it("respects MFA_FRESHNESS_HOURS env override", () => {
    process.env.MFA_FRESHNESS_HOURS = "1";
    const ninetyMinutesAgo = new Date(
      Date.now() - 90 * 60 * 1000
    ).toISOString();
    // Pass freshness_ms explicitly using defaultFreshnessMs() so the env is read.
    expect(isMfaFresh(ninetyMinutesAgo, Date.now(), defaultFreshnessMs())).toBe(false);
  });

  it("returns false on malformed timestamp", () => {
    expect(isMfaFresh("not-a-date")).toBe(false);
  });
});

describe("isSensitiveRoute", () => {
  it.each([
    ["/platform", true],
    ["/platform/organizations", true],
    ["/admin/billing", true],
    ["/admin/integrations/voice-iq", true],
    ["/admin/webhooks", true],
    ["/settings/users", true],
    ["/settings/roles", true],
    ["/admin", false],
    ["/dashboard", false],
    ["/cp", false],
    ["/admin/dashboards", false],
  ])("%s -> %s", (path, expected) => {
    expect(isSensitiveRoute(path)).toBe(expected);
  });
});

describe("isDemoBypassActive", () => {
  it("true when MFA_DEMO_MODE=true", async () => {
    process.env.MFA_DEMO_MODE = "true";
    const r = await isDemoBypassActive({ from: vi.fn() } as never);
    expect(r).toBe(true);
  });

  it("false when neither env nor flag is set", async () => {
    const r = await isDemoBypassActive({ from: vi.fn() } as never);
    expect(r).toBe(false);
  });
});

describe("markMfaVerified", () => {
  it("updates timestamp + audits", async () => {
    const updates: unknown[] = [];
    const audits: unknown[] = [];
    const profilesChain = {
      update: vi.fn((row: unknown) => {
        updates.push(row);
        return Object.assign(profilesChain, {
          eq: vi.fn(() => Promise.resolve({ error: null })),
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
      from: vi.fn((t: string) => {
        if (t === "profiles") return profilesChain;
        if (t === "audit_log") return auditChain;
        throw new Error(`unexpected ${t}`);
      }),
    };
    const r = await markMfaVerified(USER, client as never);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(typeof r.verified_at).toBe("string");
    expect((updates[0] as { mfa_verified_at: string }).mfa_verified_at).toBe(
      r.verified_at
    );
    expect((audits[0] as { action: string }).action).toBe("mfa_verified");
  });
});
