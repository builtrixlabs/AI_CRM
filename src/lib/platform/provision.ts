import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/permissions";
import type { CurrentUser } from "@/lib/auth/types";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const provisionOrganizationSchema = z
  .object({
    name: z.string().min(1).max(100),
    slug: z
      .string()
      .regex(/^[a-z0-9-]+$/, "lowercase letters, digits, dashes only")
      .min(3)
      .max(50),
    gstin: z.string().optional(),
    primary_contact_name: z.string().min(1),
    primary_contact_email: z.string().email(),
    primary_contact_phone: z.string().optional(),
    /**
     * Initial password for the org_admin. Required (no magic-link
     * flow — operator preference 2026-05-08: super_admin sets the
     * password directly and hands it to the org_admin out of band).
     */
    org_admin_password: z
      .string()
      .min(8, "password must be at least 8 characters")
      .max(128),
    plan_tier: z.enum(["starter", "professional", "enterprise", "custom"]),
  })
  .strict();

export type ProvisionInput = z.infer<typeof provisionOrganizationSchema>;

export type ProvisionResult = {
  organization_id: string;
  workspace_id: string;
  org_admin_user_id: string;
  org_admin_email: string;
};

/**
 * Atomically provision a new org. Caller MUST have already gated on
 * `requirePermission(user, 'organizations:create')` — the function does it
 * again as defense-in-depth, but the redundant check costs nothing.
 *
 * No DB transaction (Supabase JS doesn't expose them) — manual rollback
 * runs the inverse of every successful step on partial failure.
 *
 * Auth flow: operator-set password (no magic link). The auth user is
 * created with `email_confirm: true` and the supplied password, so the
 * org_admin can immediately sign in via the email+password mode of the
 * sign-in page. Super_admin shares the credentials out of band.
 */
export async function provisionOrganization(
  user: CurrentUser,
  input: ProvisionInput,
  client: SupabaseClient = getSupabaseAdmin()
): Promise<ProvisionResult> {
  requirePermission(user, "organizations:create");

  const parsed = provisionOrganizationSchema.parse(input);
  const actor = user.user.id;
  const created_via = "manual";

  let organization_id: string | null = null;
  let workspace_id: string | null = null;
  let auth_user_id: string | null = null;

  try {
    // 1. organizations
    {
      const { data, error } = await client
        .from("organizations")
        .insert({
          slug: parsed.slug,
          name: parsed.name,
          gstin: parsed.gstin ?? null,
          primary_contact_email: parsed.primary_contact_email,
          plan_tier: parsed.plan_tier,
          created_by: actor,
          created_via,
          updated_by: actor,
          updated_via: created_via,
        })
        .select("id")
        .single();
      if (error) throw error;
      organization_id = data.id;
    }

    // 2. default workspace
    {
      const { data, error } = await client
        .from("workspaces")
        .insert({
          organization_id,
          slug: "default",
          name: `${parsed.name} — Default Workspace`,
          created_by: actor,
          created_via,
          updated_by: actor,
          updated_via: created_via,
        })
        .select("id")
        .single();
      if (error) throw error;
      workspace_id = data.id;
    }

    // 3. create the org_admin auth user with the operator-supplied
    //    password. email_confirm:true skips the verification email;
    //    the org_admin signs in directly with email + password.
    {
      const { data, error } = await client.auth.admin.createUser({
        email: parsed.primary_contact_email,
        password: parsed.org_admin_password,
        email_confirm: true,
      });
      if (error) throw error;
      auth_user_id = data.user.id;
    }

    // 4. profile for the new org_admin
    {
      const { error } = await client.from("profiles").insert({
        id: auth_user_id,
        organization_id,
        email: parsed.primary_contact_email,
        display_name: parsed.primary_contact_name,
        base_role: "org_admin",
        phone: parsed.primary_contact_phone ?? null,
        created_by: auth_user_id,
        created_via,
        updated_by: auth_user_id,
        updated_via: created_via,
      });
      if (error) throw error;
    }

    // 5. subscription
    {
      const { error } = await client.from("subscriptions").insert({
        organization_id,
        plan_tier: parsed.plan_tier,
        status: "active",
        created_by: actor,
        created_via,
        updated_by: actor,
        updated_via: created_via,
      });
      if (error) throw error;
    }

    // 6. consolidated audit_log row. Password is NEVER recorded;
    //    only the fact that one was set + by whom.
    await client.from("audit_log").insert({
      actor_id: actor,
      actor_type: "user",
      actor_role: "super_admin",
      organization_id,
      table_name: "organizations",
      record_id: organization_id,
      action: "create_organization",
      diff: {
        after: {
          slug: parsed.slug,
          name: parsed.name,
          plan_tier: parsed.plan_tier,
          primary_contact_email: parsed.primary_contact_email,
          workspace_id,
          org_admin_user_id: auth_user_id,
          password_set: true,
        },
      },
    });

    return {
      organization_id: organization_id!,
      workspace_id: workspace_id!,
      org_admin_user_id: auth_user_id!,
      org_admin_email: parsed.primary_contact_email,
    };
  } catch (err) {
    // Rollback in reverse order. Best-effort; ignores compensating-delete
    // failures (the failure that triggered rollback is the one we throw).
    try {
      await client.from("subscriptions").delete().eq("organization_id", organization_id ?? "");
    } catch {}
    if (auth_user_id) {
      try {
        await client.from("profiles").delete().eq("id", auth_user_id);
      } catch {}
      try {
        await client.auth.admin.deleteUser(auth_user_id);
      } catch {}
    }
    if (workspace_id) {
      try {
        await client.from("workspaces").delete().eq("id", workspace_id);
      } catch {}
    }
    if (organization_id) {
      try {
        await client.from("organizations").delete().eq("id", organization_id);
      } catch {}
    }
    throw err;
  }
}
