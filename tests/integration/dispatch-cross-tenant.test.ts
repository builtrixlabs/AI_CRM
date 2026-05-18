/**
 * D-603 / AC-5 — cross-tenant isolation of resolveOrgAdapter.
 *
 * resolveOrgAdapter reads org_{channel}_config through the service-role
 * admin client, which bypasses RLS. The `.eq("organization_id", …)` filter
 * is the ONLY thing isolating tenants on that read. This test proves it:
 * org A and org B each resolve their OWN config row, and a config-less org
 * resolves to not_configured — all through the same RLS-bypassing client.
 *
 * Requires live Supabase env (see tests/integration/helpers/setup.ts).
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveOrgAdapter } from "@/lib/comms/resolve-org-adapter";
import { encryptJson } from "@/lib/comms/encryption";
import { ResendEmailProvider } from "@/lib/comms/email/providers/resend";
import { adminClient, cleanupBySlug, provisionOrg } from "./helpers/setup";

const SYSTEM_UUID = "00000000-0000-0000-0000-000000000000";
const SLUG_A = `test-d603-xtenant-a-${Date.now()}`;
const SLUG_B = `test-d603-xtenant-b-${Date.now()}`;
// A valid uuid that is never provisioned — proves the no-row → not_configured
// path on a service-role read.
const NO_CONFIG_ORG = "00000000-0000-4000-8000-0000000d6030";

let orgA: string;
let orgB: string;

beforeAll(async () => {
  await cleanupBySlug(SLUG_A);
  await cleanupBySlug(SLUG_B);
  orgA = await provisionOrg(SLUG_A);
  orgB = await provisionOrg(SLUG_B);

  // Org A: a real, supported provider (resend) → resolves to a live adapter.
  // Org B: a different, unsupported provider (postmark) → resolves to
  // provider_error. The rows are deliberately distinct so a cross-tenant
  // leak is observable: if org B's resolution returned org A's row it would
  // be { ok: true, provider: "resend" } instead of provider_error.
  const insA = await adminClient.from("org_email_config").insert({
    organization_id: orgA,
    provider: "resend",
    encrypted_credentials: encryptJson({ api_key: "re_test_orga" }),
    from_email: "orga@test.builtrix.in",
    from_name: null,
    is_active: true,
    created_by: SYSTEM_UUID,
    updated_by: SYSTEM_UUID,
  });
  if (insA.error) throw insA.error;

  const insB = await adminClient.from("org_email_config").insert({
    organization_id: orgB,
    provider: "postmark",
    encrypted_credentials: encryptJson({ api_key: "pm_test_orgb" }),
    from_email: "orgb@test.builtrix.in",
    from_name: null,
    is_active: true,
    created_by: SYSTEM_UUID,
    updated_by: SYSTEM_UUID,
  });
  if (insB.error) throw insB.error;
}, 30_000);

afterAll(async () => {
  // org_email_config is ON DELETE CASCADE, but cleanupBySlug's org delete
  // can fail if audit_log references the org — delete the config rows
  // explicitly first so they never orphan.
  if (orgA)
    await adminClient
      .from("org_email_config")
      .delete()
      .eq("organization_id", orgA);
  if (orgB)
    await adminClient
      .from("org_email_config")
      .delete()
      .eq("organization_id", orgB);
  await cleanupBySlug(SLUG_A);
  await cleanupBySlug(SLUG_B);
});

describe("D-603 — resolveOrgAdapter cross-tenant isolation", () => {
  it("org A resolves its OWN resend config", async () => {
    const r = await resolveOrgAdapter("email", orgA, adminClient);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.provider).toBe("resend");
      expect(r.adapter).toBeInstanceOf(ResendEmailProvider);
    }
  });

  it("org B resolves its OWN postmark config — never org A's row", async () => {
    const r = await resolveOrgAdapter("email", orgB, adminClient);
    // org B's row says postmark → provider_error. If the resolver leaked
    // org A's row, this would be { ok: true, provider: "resend" }.
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("provider_error");
  });

  it("a config-less org resolves to not_configured", async () => {
    const r = await resolveOrgAdapter("email", NO_CONFIG_ORG, adminClient);
    expect(r).toEqual({ ok: false, reason: "not_configured" });
  });
});
