import { isSensitiveRoute } from "./sensitive-routes";
import type { CurrentUser } from "./types";

export type RouteDecision =
  | { kind: "allow" }
  | { kind: "redirect"; target: string }
  | { kind: "unauthorized" };

/**
 * Pre-resolved MFA gate state. The middleware computes this from the
 * user's profile + the env-only demo bypass and passes it through.
 *
 * - `enrolled` — `profiles.mfa_enrolled_at IS NOT NULL`
 * - `fresh` — `isMfaFresh(profiles.mfa_verified_at)`
 * - `bypass` — `process.env.MFA_DEMO_MODE === "true"` (no platform_flag
 *   lookup at the edge — the v2 advisory banner that gated on the
 *   `demo_mode` flag is removed in D-300 slice 3)
 */
export type MfaState = {
  enrolled: boolean;
  fresh: boolean;
  bypass: boolean;
};

const PUBLIC_PATHS = ["/auth/sign-in", "/auth/callback", "/403"];

/** Authenticated paths the role-based decision always allows so they
 * can act as the *unblock* surface — finishing OAuth, hitting the 403
 * page, or completing the MFA enrollment / re-verify flow. */
const AUTH_BYPASS_PATHS = ["/auth/callback", "/403", "/auth/mfa"];

/** Paths the MFA gate must NEVER redirect (otherwise infinite loop —
 * the unblock path can't itself trigger the gate it unblocks). */
const MFA_FLOW_PATHS = ["/auth/mfa"];

const SURFACES = {
  platform: "/platform",
  admin: "/admin",
  settings: "/settings",
  dashboard: "/dashboard",
  cp: "/cp",
} as const;

const isUnder = (path: string, prefix: string) =>
  path === prefix || path.startsWith(prefix + "/");

const isPublic = (path: string) =>
  PUBLIC_PATHS.some((p) => isUnder(path, p));

const isAuthBypass = (path: string) =>
  AUTH_BYPASS_PATHS.some((p) => isUnder(path, p));

const isMfaFlow = (path: string) =>
  MFA_FLOW_PATHS.some((p) => isUnder(path, p));

const isApi = (path: string) => isUnder(path, "/api");

const landingFor = (user: CurrentUser): string => {
  switch (user.profile.base_role) {
    case "super_admin":
      return SURFACES.platform;
    case "org_owner":
    case "org_admin":
      return SURFACES.admin;
    case "channel_partner":
      return SURFACES.cp;
    default:
      return SURFACES.dashboard;
  }
};

/**
 * Pure role-based routing decision. Mirrors v2 behavior — does NOT
 * consider MFA. The MFA gate is layered in `decideRoute` below.
 */
function decideByRole(
  user: CurrentUser | null,
  pathname: string
): RouteDecision {
  if (isPublic(pathname) && user === null) return { kind: "allow" };

  if (isApi(pathname) && user === null) return { kind: "allow" };

  if (user === null) {
    return { kind: "redirect", target: "/auth/sign-in" };
  }

  if (isAuthBypass(pathname)) return { kind: "allow" };

  const role = user.profile.base_role;

  if (role === "service_account") {
    if (isApi(pathname)) return { kind: "allow" };
    return { kind: "unauthorized" };
  }

  if (pathname === "/") {
    return { kind: "redirect", target: landingFor(user) };
  }

  if (role === "super_admin") {
    if (isUnder(pathname, SURFACES.platform)) return { kind: "allow" };
    if (isApi(pathname)) return { kind: "allow" };
    return { kind: "redirect", target: SURFACES.platform };
  }

  if (role === "org_owner" || role === "org_admin") {
    if (isUnder(pathname, SURFACES.platform)) {
      return { kind: "redirect", target: SURFACES.admin };
    }
    if (
      isUnder(pathname, SURFACES.admin) ||
      isUnder(pathname, SURFACES.settings) ||
      isUnder(pathname, SURFACES.dashboard) ||
      isApi(pathname)
    ) {
      return { kind: "allow" };
    }
    return { kind: "redirect", target: SURFACES.admin };
  }

  if (role === "channel_partner") {
    if (isUnder(pathname, SURFACES.platform)) {
      return { kind: "redirect", target: SURFACES.cp };
    }
    if (isUnder(pathname, SURFACES.admin) || isUnder(pathname, SURFACES.settings)) {
      return { kind: "redirect", target: SURFACES.cp };
    }
    if (
      isUnder(pathname, SURFACES.cp) ||
      isUnder(pathname, SURFACES.dashboard) ||
      isApi(pathname)
    ) {
      return { kind: "allow" };
    }
    return { kind: "redirect", target: SURFACES.cp };
  }

  if (isUnder(pathname, SURFACES.platform)) {
    return { kind: "redirect", target: SURFACES.dashboard };
  }
  if (isUnder(pathname, SURFACES.admin) || isUnder(pathname, SURFACES.settings)) {
    return { kind: "redirect", target: SURFACES.dashboard };
  }
  if (isUnder(pathname, SURFACES.cp)) {
    return { kind: "redirect", target: SURFACES.dashboard };
  }
  if (isUnder(pathname, SURFACES.dashboard) || isApi(pathname)) {
    return { kind: "allow" };
  }

  return { kind: "redirect", target: SURFACES.dashboard };
}

/**
 * Pure routing decision used by edge middleware. No I/O, no side effects.
 *
 * The optional `mfa_state` is the pre-resolved MFA gate the caller
 * (middleware) computed from `user.profile.mfa_*` + env-only demo bypass.
 * When omitted, MFA gating is skipped (back-compat — the existing
 * 27-case route-policy test suite passes `mfa_state=undefined`).
 *
 * MFA gate fires only when ALL of these hold:
 *   - role-based decision is "allow"
 *   - user is authenticated
 *   - mfa_state is supplied
 *   - mfa_state.bypass is false
 *   - pathname matches `isSensitiveRoute`
 *   - pathname is not itself the MFA unblock flow (`/auth/mfa*`)
 *
 * Then:
 *   - !mfa_state.enrolled → redirect /auth/mfa/setup?return=<path>
 *   - !mfa_state.fresh    → redirect /auth/mfa?return=<path>
 */
export function decideRoute(
  user: CurrentUser | null,
  pathname: string,
  mfa_state?: MfaState
): RouteDecision {
  const decision = decideByRole(user, pathname);
  if (decision.kind !== "allow") return decision;
  if (!user) return decision;
  if (!mfa_state) return decision;
  if (mfa_state.bypass) return decision;
  if (isMfaFlow(pathname)) return decision;
  if (!isSensitiveRoute(pathname)) return decision;
  const ret = encodeURIComponent(pathname);
  if (!mfa_state.enrolled) {
    return { kind: "redirect", target: `/auth/mfa/setup?return=${ret}` };
  }
  if (!mfa_state.fresh) {
    return { kind: "redirect", target: `/auth/mfa?return=${ret}` };
  }
  return decision;
}
