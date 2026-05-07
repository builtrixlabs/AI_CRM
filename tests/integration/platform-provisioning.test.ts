/**
 * D-004 / C6 — real-DB provisioning end-to-end.
 * Spec AC-2, AC-3.
 *
 * super_admin calls provisionOrganization against bwumqahgwobwghlmzcrl.
 * Verifies all 5 rows are inserted + 1 audit row.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { provisionOrganization } from "@/lib/platform/provision";
import type { CurrentUser } from "@/lib/auth/types";
import {
  adminClient,
  cleanupBySlug,
  deleteAuthUser,
  provisionUser,
  type ProvisionedUser,
} from "./helpers/setup";

const SLUG = `prov-test-${Date.now()}`;
const ADMIN_EMAIL = `prov-admin-${Date.now()}@test.builtrix.in`;

let superAdmin: ProvisionedUser;
let provisionedOrgId: string | null = null;
let provisionedAuthUserId: string | null = null;

beforeAll(async () => {
  const { data: prior } = await adminClient
    .from("profiles")
    .select("id")
    .eq("email", "prov-super@test.builtrix.in")
    .maybeSingle();
  if (prior) await deleteAuthUser(prior.id);

  superAdmin = await provisionUser({
    email: "prov-super@test.builtrix.in",
    password: "T3st-pass-prov-super",
    base_role: "super_admin",
    organization_id: null,
  });
}, 30_000);

afterAll(async () => {
  if (provisionedAuthUserId) {
    try {
      await adminClient.from("subscriptions").delete().eq("organization_id", provisionedOrgId ?? "");
      await adminClient.from("profiles").delete().eq("id", provisionedAuthUserId);
      await adminClient.auth.admin.deleteUser(provisionedAuthUserId);
    } catch {}
  }
  if (superAdmin) await deleteAuthUser(superAdmin.user_id);
  await cleanupBySlug(SLUG);
});

describe("provisionOrganization — real DB end-to-end", () => {
  it("inserts org + workspace + profile + subscription + audit row in order", async () => {
    const user: CurrentUser = {
      user: { id: superAdmin.user_id, email: superAdmin.email },
      profile: {
        id: superAdmin.user_id,
        display_name: superAdmin.email,
        base_role: "super_admin",
      },
      org_id: null,
      workspace_ids: [],
      app_roles: [],
    };

    const result = await provisionOrganization(user, {
      name: `Test Org ${SLUG}`,
      slug: SLUG,
      primary_contact_name: "Anita Bhalla",
      primary_contact_email: ADMIN_EMAIL,
      plan_tier: "professional",
    });
    provisionedOrgId = result.organization_id;
    provisionedAuthUserId = result.org_admin_user_id;

    expect(result.organization_id).toBeTruthy();
    expect(result.workspace_id).toBeTruthy();
    expect(result.org_admin_user_id).toBeTruthy();

    // 1. organization exists
    const org = await adminClient
      .from("organizations")
      .select("id, slug, plan_tier")
      .eq("id", result.organization_id)
      .single();
    expect(org.data?.slug).toBe(SLUG);
    expect(org.data?.plan_tier).toBe("professional");

    // 2. workspace exists
    const ws = await adminClient
      .from("workspaces")
      .select("id, slug")
      .eq("id", result.workspace_id)
      .single();
    expect(ws.data?.slug).toBe("default");

    // 3. profile exists with org_admin role
    const profile = await adminClient
      .from("profiles")
      .select("id, base_role, organization_id, email")
      .eq("id", result.org_admin_user_id)
      .single();
    expect(profile.data?.base_role).toBe("org_admin");
    expect(profile.data?.organization_id).toBe(result.organization_id);
    expect(profile.data?.email).toBe(ADMIN_EMAIL);

    // 4. subscription exists at correct plan
    const sub = await adminClient
      .from("subscriptions")
      .select("plan_tier, status")
      .eq("organization_id", result.organization_id)
      .single();
    expect(sub.data?.plan_tier).toBe("professional");
    expect(sub.data?.status).toBe("active");

    // 5. audit row 'create_organization' exists
    const audit = await adminClient
      .from("audit_log")
      .select("action, organization_id, actor_id, diff")
      .eq("action", "create_organization")
      .eq("organization_id", result.organization_id);
    expect(audit.data?.length).toBe(1);
    expect(audit.data?.[0].actor_id).toBe(superAdmin.user_id);
    const diff = audit.data?.[0].diff as { after: { slug: string } };
    expect(diff.after.slug).toBe(SLUG);
  }, 60_000);
});
