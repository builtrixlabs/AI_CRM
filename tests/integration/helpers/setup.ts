/**
 * Integration test helpers — Supabase clients, user provisioning, sign-in.
 *
 * Required env (load via .env.local or shell):
 *   SUPABASE_URL                       (or NEXT_PUBLIC_SUPABASE_URL)
 *   SUPABASE_PUBLISHABLE_KEY           (or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Required Supabase config:
 *   - All migrations from supabase/migrations/ applied.
 *   - Auth hook `public.custom_access_token_hook` enabled
 *     (Project → Auth → Hooks; or supabase/config.toml [auth.hook.custom_access_token]).
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anonKey =
  process.env.SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

if (!url) throw new Error("Integration tests need SUPABASE_URL");
if (!serviceKey) throw new Error("Integration tests need SUPABASE_SERVICE_ROLE_KEY");
if (!anonKey) throw new Error("Integration tests need SUPABASE_PUBLISHABLE_KEY");

export const supabaseUrl = url;
export const supabaseAnonKey = anonKey;

export const adminClient: SupabaseClient = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const SYSTEM_UUID = "00000000-0000-0000-0000-000000000000";

export type ProvisionedUser = {
  user_id: string;
  email: string;
  password: string;
};

export async function provisionOrg(slug: string): Promise<string> {
  const { data, error } = await adminClient
    .from("organizations")
    .insert({
      slug,
      name: `Test Org — ${slug}`,
      created_by: SYSTEM_UUID,
      created_via: "system",
      updated_by: SYSTEM_UUID,
      updated_via: "system",
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function provisionWorkspace(
  orgId: string,
  slug: string
): Promise<string> {
  const { data, error } = await adminClient
    .from("workspaces")
    .insert({
      organization_id: orgId,
      slug,
      name: `Workspace ${slug}`,
      created_by: SYSTEM_UUID,
      created_via: "system",
      updated_by: SYSTEM_UUID,
      updated_via: "system",
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function provisionUser(opts: {
  email: string;
  password: string;
  base_role: string;
  organization_id: string | null;
  display_name?: string;
}): Promise<ProvisionedUser> {
  const { data, error } = await adminClient.auth.admin.createUser({
    email: opts.email,
    password: opts.password,
    email_confirm: true,
  });
  if (error) throw error;
  const userId = data.user.id;

  const { error: profErr } = await adminClient.from("profiles").insert({
    id: userId,
    organization_id: opts.organization_id,
    email: opts.email,
    display_name: opts.display_name ?? opts.email,
    base_role: opts.base_role,
    created_by: userId,
    created_via: "system",
    updated_by: userId,
    updated_via: "system",
  });
  if (profErr) throw profErr;

  return { user_id: userId, email: opts.email, password: opts.password };
}

/** Returns a Supabase client signed in as the given user. */
export async function userClient(
  user: ProvisionedUser
): Promise<SupabaseClient> {
  const c = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await c.auth.signInWithPassword({
    email: user.email,
    password: user.password,
  });
  if (error) throw error;
  return c;
}

/** Best-effort cleanup — call from afterAll. */
export async function cleanupBySlug(slug: string): Promise<void> {
  const { data } = await adminClient
    .from("organizations")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (!data) return;
  // Cascades: profiles ON DELETE CASCADE, workspaces / teams ON DELETE RESTRICT,
  // so we manually clean those first.
  await adminClient.from("teams").delete().eq("organization_id", data.id);
  await adminClient.from("workspaces").delete().eq("organization_id", data.id);
  await adminClient.from("user_app_roles").delete().eq("organization_id", data.id);
  await adminClient.from("profiles").delete().eq("organization_id", data.id);
  await adminClient.from("organizations").delete().eq("id", data.id);
}

export async function deleteAuthUser(userId: string): Promise<void> {
  await adminClient.auth.admin.deleteUser(userId);
}
