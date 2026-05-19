import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getImpersonationCookiePayload } from "@/lib/platform/impersonation";
import { effectivePermissions } from "@/lib/auth/rbac";
import type { AppRole, BaseRole, CurrentUser, Impersonation } from "./types";

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
  view_defaults?: Record<string, string> | null;
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
 *
 * Perf — the no-arg path is wrapped in React's `cache()` so a single
 * server-component render (layout → page → nested components) pays the
 * 4 DB roundtrips (auth.getUser + profiles SELECT + revocation RPC +
 * user_app_roles SELECT) **once** instead of N times. Before this:
 * /dashboard burned ~8 roundtrips per nav (layout + page both calling
 * getCurrentUser); after, it's 4. The `client?` overload bypasses the
 * cache because the cache key would be the client argument — passing a
 * fresh client every call defeats dedupe.
 */
export async function getCurrentUser(
  client?: SupabaseClient
): Promise<CurrentUser | null> {
  if (!client) return _getCurrentUserCached();
  return _getCurrentUserImpl(client);
}

/** Cached per request — `cache()` dedupes across server-component callers. */
const _getCurrentUserCached = cache(
  async (): Promise<CurrentUser | null> => _getCurrentUserImpl(undefined),
);

async function _getCurrentUserImpl(
  client?: SupabaseClient,
): Promise<CurrentUser | null> {
  const c = client ?? (await createSupabaseServerClient());

  const {
    data: { user },
  } = await c.auth.getUser();
  if (!user) return null;

  const { data: profile, error: profileError } = (await c
    .from("profiles")
    .select(
      "id, display_name, base_role, organization_id, phone, notification_prefs, theme, mfa_verified_at, mfa_enrolled_at, view_defaults"
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

  // D-606 — impersonation overlay. The cookie payload is the source of
  // truth; if valid AND the underlying auth user still holds
  // platform:manage AND the cookie's impersonator_id matches the live
  // auth user, the returned CurrentUser is overlayed onto the target org.
  const impersonation = await resolveImpersonationOverlay({
    auth_user_id: user.id,
    base_role: profile.base_role as BaseRole,
    bridge_app_roles: app_roles.map((r) => r.app_role),
  });

  if (impersonation) {
    return {
      user: { id: user.id, email: user.email ?? "" },
      profile: {
        id: profile.id,
        display_name: profile.display_name,
        // Overlay: while impersonating, the request executes as an
        // org_admin (the highest org-tier role) on the target org.
        base_role: "org_admin" as BaseRole,
        phone: profile.phone ?? null,
        notification_prefs:
          (profile.notification_prefs as
            | import("./types").NotificationPrefs
            | undefined) ?? {},
        theme,
        mfa_verified_at: profile.mfa_verified_at ?? null,
        mfa_enrolled_at: profile.mfa_enrolled_at ?? null,
        view_defaults: (profile.view_defaults as Record<string, string> | null) ?? {},
      },
      org_id: impersonation.organization_id,
      workspace_ids: [],
      app_roles: [],
      impersonation,
    };
  }

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
      view_defaults: (profile.view_defaults as Record<string, string> | null) ?? {},
    },
    org_id: profile.organization_id,
    workspace_ids,
    app_roles,
    impersonation: null,
  };
}

/**
 * D-606 — read the impersonation cookie + cross-check the caller. Returns
 * the Impersonation context to overlay, or null if any check fails.
 *
 * Defence-in-depth:
 *   1. cookie present, signature valid, not expired   (verify in lib/impersonation)
 *   2. cookie's impersonator_id === live auth.getUser().id
 *      (catches a stolen cookie replayed from another browser)
 *   3. caller's base/app role permissions still include `platform:manage`
 *      (catches a super admin whose role was revoked mid-session)
 */
async function resolveImpersonationOverlay(args: {
  auth_user_id: string;
  base_role: BaseRole;
  bridge_app_roles: AppRole[];
}): Promise<Impersonation | null> {
  const payload = await getImpersonationCookiePayload();
  if (!payload) return null;
  if (payload.i !== args.auth_user_id) return null;
  const perms = effectivePermissions({
    base_role: args.base_role,
    bridge_app_roles: args.bridge_app_roles,
    org_allow_overrides: [],
    org_deny_overrides: [],
  });
  if (!perms.has("platform:manage")) return null;

  // Best-effort org-name lookup for the banner.
  let organization_name: string | null = null;
  try {
    const { data } = await getSupabaseAdmin()
      .from("organizations")
      .select("name")
      .eq("id", payload.o)
      .maybeSingle();
    organization_name = (data as { name: string } | null)?.name ?? null;
  } catch {
    organization_name = null;
  }

  return {
    impersonator_id: payload.i,
    organization_id: payload.o,
    organization_name,
    started_at: payload.s,
    expires_at: payload.e,
  };
}
