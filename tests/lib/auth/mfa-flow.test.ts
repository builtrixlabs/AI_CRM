/**
 * D-300 — MFA enrollment + verify + recovery flow (mocked-DB integration).
 *
 * Exercises the server-action chain end-to-end with an in-memory
 * fake-Supabase + fake-headers + fake-redirect. The unit-test layer
 * (totp.test.ts, recovery-codes.test.ts) already covers the crypto
 * primitives; this layer covers the action orchestration:
 * setup -> confirm -> verify -> stale -> recover.
 *
 * Live-DB RLS isolation is operator-verified post-deploy (Supabase
 * dashboard or `bash scripts/v2-acceptance/run.sh` style probe).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  generateSecret,
  encryptSecret,
  type MfaSecretPayload,
} from "@/lib/auth/totp";
import { generateCodes, hashCodes } from "@/lib/auth/recovery-codes";
import { mfaVerifyBucket } from "@/lib/auth/rate-limit";
import { TOTP, Secret } from "otpauth";

const USER_ID = "11111111-2222-4333-8444-555555555555";
const ORG_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const EMAIL = "user@example.com";

type ProfileRow = {
  id: string;
  organization_id: string;
  mfa_secret: MfaSecretPayload | null;
  mfa_recovery_codes: unknown[] | null;
  mfa_enrolled_at: string | null;
  mfa_verified_at: string | null;
};

type AuditRow = { action: string; diff: Record<string, unknown> };

let profile: ProfileRow;
let auditLog: AuditRow[] = [];
let redirectTarget: string | null = null;
let nowSpy: ReturnType<typeof vi.spyOn> | null = null;

class RedirectError extends Error {
  constructor(public target: string) {
    super(`redirect:${target}`);
  }
}

vi.mock("next/headers", () => ({
  headers: async () =>
    new Headers({ "x-forwarded-for": "203.0.113.42" }),
}));

vi.mock("next/navigation", () => ({
  redirect: (target: string) => {
    redirectTarget = target;
    throw new RedirectError(target);
  },
}));

vi.mock("@/lib/auth/getCurrentUser", () => ({
  getCurrentUser: async () => ({
    user: { id: USER_ID, email: EMAIL },
    profile: {
      id: USER_ID,
      display_name: "Test User",
      base_role: "org_admin",
      phone: null,
      notification_prefs: {},
      theme: "system",
      mfa_verified_at: profile.mfa_verified_at,
      mfa_enrolled_at: profile.mfa_enrolled_at,
    },
    org_id: ORG_ID,
    workspace_ids: ["ws-1"],
    app_roles: [],
  }),
}));

function fakeAdmin() {
  return {
    from(table: string) {
      if (table === "profiles") {
        return {
          select() {
            return {
              eq() {
                return {
                  maybeSingle: async () => ({ data: profile, error: null }),
                  single: async () => ({ data: profile, error: null }),
                };
              },
            };
          },
          update(row: Partial<ProfileRow>) {
            Object.assign(profile, row);
            return {
              eq: async () => ({ error: null }),
            };
          },
        };
      }
      if (table === "audit_log") {
        return {
          insert: async (row: AuditRow) => {
            auditLog.push(row);
            return { error: null };
          },
        };
      }
      throw new Error(`Unexpected table ${table}`);
    },
  };
}

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => fakeAdmin(),
}));

beforeEach(() => {
  profile = {
    id: USER_ID,
    organization_id: ORG_ID,
    mfa_secret: null,
    mfa_recovery_codes: null,
    mfa_enrolled_at: null,
    mfa_verified_at: null,
  };
  auditLog = [];
  redirectTarget = null;
  nowSpy = null;
  mfaVerifyBucket._reset();
});

afterEach(() => {
  if (nowSpy) nowSpy.mockRestore();
});

function freshTotpCode(secret_b32: string, now_ms: number = Date.now()): string {
  return new TOTP({
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secret_b32),
  }).generate({ timestamp: now_ms });
}

async function seedPendingEnrollment(): Promise<{
  secret_b32: string;
  plaintextCodes: string[];
}> {
  const { secret_b32 } = generateSecret();
  const plaintextCodes = generateCodes(10);
  profile.mfa_secret = encryptSecret(secret_b32);
  profile.mfa_recovery_codes = await hashCodes(plaintextCodes);
  return { secret_b32, plaintextCodes };
}

async function seedFinishedEnrollment(): Promise<{
  secret_b32: string;
  plaintextCodes: string[];
}> {
  const seed = await seedPendingEnrollment();
  profile.mfa_enrolled_at = new Date().toISOString();
  profile.mfa_verified_at = profile.mfa_enrolled_at;
  return seed;
}

describe("D-300 mfa-flow — enrollment", () => {
  it("confirmEnrollmentAction with valid code sets enrolled+verified and audits mfa.enrolled", async () => {
    const { confirmEnrollmentAction } = await import(
      "@/app/auth/mfa/setup/actions"
    );
    const { secret_b32 } = await seedPendingEnrollment();
    const fd = new FormData();
    fd.set("code", freshTotpCode(secret_b32));

    await expect(
      confirmEnrollmentAction(fd, "/admin/billing")
    ).rejects.toThrow(RedirectError);

    expect(redirectTarget).toBe("/admin/billing");
    expect(profile.mfa_enrolled_at).not.toBeNull();
    expect(profile.mfa_verified_at).toBe(profile.mfa_enrolled_at);
    expect(auditLog.some((a) => a.action === "mfa.enrolled")).toBe(true);
  });

  it("confirmEnrollmentAction with wrong code redirects to setup with ?error=invalid_code, audits mfa.verify_failed", async () => {
    const { confirmEnrollmentAction } = await import(
      "@/app/auth/mfa/setup/actions"
    );
    await seedPendingEnrollment();
    const fd = new FormData();
    fd.set("code", "000000");

    await expect(
      confirmEnrollmentAction(fd, "/admin/billing")
    ).rejects.toThrow(RedirectError);

    expect(redirectTarget).toContain("/auth/mfa/setup");
    expect(redirectTarget).toContain("error=invalid_code");
    expect(profile.mfa_enrolled_at).toBeNull();
    expect(auditLog.some((a) => a.action === "mfa.verify_failed")).toBe(true);
  });

  it("confirmEnrollmentAction without pending secret redirects to fresh setup", async () => {
    const { confirmEnrollmentAction } = await import(
      "@/app/auth/mfa/setup/actions"
    );
    const fd = new FormData();
    fd.set("code", "123456");

    await expect(
      confirmEnrollmentAction(fd, "/admin/billing")
    ).rejects.toThrow(RedirectError);

    expect(redirectTarget).toContain("/auth/mfa/setup");
    expect(redirectTarget).not.toContain("error=invalid_code");
  });
});

describe("D-300 mfa-flow — verify (TOTP)", () => {
  it("verifyTotpAction with valid code bumps mfa_verified_at + audits mfa.verified", async () => {
    const { verifyTotpAction } = await import("@/app/auth/mfa/actions");
    const { secret_b32 } = await seedFinishedEnrollment();
    profile.mfa_verified_at = new Date(Date.now() - 9 * 60 * 60 * 1000).toISOString();
    const earlier = profile.mfa_verified_at;
    const fd = new FormData();
    fd.set("code", freshTotpCode(secret_b32));

    await expect(
      verifyTotpAction(fd, "/admin/billing")
    ).rejects.toThrow(RedirectError);

    expect(redirectTarget).toBe("/admin/billing");
    expect(profile.mfa_verified_at).not.toBe(earlier);
    expect(
      auditLog.some(
        (a) =>
          a.action === "mfa.verified" &&
          (a.diff as { method: string }).method === "totp"
      )
    ).toBe(true);
  });

  it("verifyTotpAction without enrollment redirects to setup", async () => {
    const { verifyTotpAction } = await import("@/app/auth/mfa/actions");
    const fd = new FormData();
    fd.set("code", "123456");

    await expect(
      verifyTotpAction(fd, "/admin/billing")
    ).rejects.toThrow(RedirectError);

    expect(redirectTarget).toContain("/auth/mfa/setup");
  });
});

describe("D-300 mfa-flow — recovery codes", () => {
  it("verifyRecoveryAction first use of a code succeeds; reusing same code fails", async () => {
    const { verifyRecoveryAction } = await import("@/app/auth/mfa/actions");
    const { plaintextCodes } = await seedFinishedEnrollment();
    const code = plaintextCodes[3];
    const fd1 = new FormData();
    fd1.set("recovery_code", code);

    await expect(
      verifyRecoveryAction(fd1, "/admin/billing")
    ).rejects.toThrow(RedirectError);
    expect(redirectTarget).toBe("/admin/billing");
    expect(
      auditLog.some(
        (a) =>
          a.action === "mfa.verified" &&
          (a.diff as { method: string }).method === "recovery_code"
      )
    ).toBe(true);

    auditLog = [];
    redirectTarget = null;
    const fd2 = new FormData();
    fd2.set("recovery_code", code);

    await expect(
      verifyRecoveryAction(fd2, "/admin/billing")
    ).rejects.toThrow(RedirectError);
    expect(redirectTarget).toContain("/auth/mfa");
    expect(redirectTarget).toContain("error=recovery_used");
    expect(auditLog.some((a) => a.action === "mfa.verify_failed")).toBe(true);
  });

  it("verifyRecoveryAction with malformed code returns invalid_recovery", async () => {
    const { verifyRecoveryAction } = await import("@/app/auth/mfa/actions");
    await seedFinishedEnrollment();
    const fd = new FormData();
    fd.set("recovery_code", "not-a-code");

    await expect(
      verifyRecoveryAction(fd, "/admin/billing")
    ).rejects.toThrow(RedirectError);
    expect(redirectTarget).toContain("error=invalid_recovery");
  });
});

describe("D-300 mfa-flow — rate limit", () => {
  it("6th attempt within 15min from same IP is rate-limited", async () => {
    const { verifyTotpAction } = await import("@/app/auth/mfa/actions");
    await seedFinishedEnrollment();

    for (let i = 0; i < 5; i++) {
      const fd = new FormData();
      fd.set("code", "000000");
      try {
        await verifyTotpAction(fd, "/admin/billing");
      } catch {
        /* expected redirect */
      }
    }
    redirectTarget = null;
    const fd = new FormData();
    fd.set("code", "000000");

    await expect(
      verifyTotpAction(fd, "/admin/billing")
    ).rejects.toThrow(RedirectError);
    expect(redirectTarget).toContain("error=rate_limited");
  });
});
