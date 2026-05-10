import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AppRole, BaseRole, CurrentUser } from "./types";

type ProfileRow = {
  id: string;
  display_name: string;
  base_role: string;
  organization_id: string | null;
  phone?: string | null;
  notification_prefs?: Record<string, unknown> | null;
  theme?: string | null;
  mfa_verified_at?: string | null;
  mfa_enrolled_at?: string | null;
};

type AppRoleRow = {
  workspace_id: string | null;
  app_role: string;
};

/**
 * Resolves the current user's full auth context for server-side use.
 *
 * Returns null in two cases:
 *   1. No active session (unauthenticated request).
 *   2. Session exists but no `profiles` row yet (race during signup before
 *      the auth.users → profiles trigger fires).
 *
 * Accepts an optional client for testing; production calls pass none and
 * receive a request-scoped server client built from cookies().
 */
export async function getCurrentUser(
  client?: SupabaseClient
): Promise<CurrentUser | null> {
  const c = client ?? (await createSupabaseServerClient());

  const {
    data: { user },
  } = await c.auth.getUser();
  if (!user) return null;

  const { data: profile, error: profileError } = (await c
    .from("profiles")
    .select(
      "id, display_name, base_role, organization_id, phone, notification_prefs, theme, mfa_verified_at, mfa_enrolled_at"
    )
    .eq("id", user.id)
    .single()) as { data: ProfileRow | null; error: unknown };

  if (profileError || !profile) return null;

  // D-302 — force-sign-out check. If the caller's org has a row in
  // org_session_revocations, treat as unauthenticated. Uses a SECURITY
  // DEFINER RPC because the table is super-admin-only at the RLS layer.
  // Fail-closed on RPC error: surfacing 401 on a transient KV/network
  // hiccup is preferable to admitting a freshly-suspended user.
  if (profile.organization_id) {
    const { data: revoked, error: revokedErr } = (await c.rpc(
      "app_is_org_revoked",
      { org_id: profile.organization_id }
    )) as { data: boolean | null; error: unknown };
    if (revokedErr || revoked === true) return null;
  }

  const { data: bridgeRows } = (await c
    .from("user_app_roles")
    .select("workspace_id, app_role")
    .eq("user_id", user.id)
    .is("deleted_at", null)) as { data: AppRoleRow[] | null; error: unknown };

  const app_roles = (bridgeRows ?? []).map((r) => ({
    workspace_id: r.workspace_id,
    app_role: r.app_role as AppRole,
  }));

  const workspace_ids = Array.from(
    new Set(
      app_roles
        .map((r) => r.workspace_id)
        .filter((w): w is string => w !== null)
    )
  );

  const themeRaw = profile.theme;
  const theme: "light" | "dark" | "system" =
    themeRaw === "light" || themeRaw === "dark" ? themeRaw : "system";

  return {
    user: { id: user.id, email: user.email ?? "" },
    profile: {
      id: profile.id,
      display_name: profile.display_name,
      base_role: profile.base_role as BaseRole,
      phone: profile.phone ?? null,
      notification_prefs:
        (profile.notification_prefs as
          | import("./types").NotificationPrefs
          | undefined) ?? {},
      theme,
      mfa_verified_at: profile.mfa_verified_at ?? null,
      mfa_enrolled_at: profile.mfa_enrolled_at ?? null,
    },
    org_id: profile.organization_id,
    workspace_ids,
    app_roles,
  };
}
