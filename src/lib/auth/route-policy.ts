import type { CurrentUser } from "./types";

export type RouteDecision =
  | { kind: "allow" }
  | { kind: "redirect"; target: string }
  | { kind: "unauthorized" };

const PUBLIC_PATHS = ["/auth/sign-in", "/auth/callback", "/403"];
const AUTH_BYPASS_PATHS = ["/auth/callback", "/403"];

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
 * Pure routing decision used by edge middleware. No I/O, no side effects.
 *
 * Rules (mirror spec AC-1..AC-8):
 *   no auth                   → 302 /auth/sign-in (unless path is public)
 *   service_account on UI     → 401 (UI blocked; APIs allowed)
 *   super_admin off /platform → 302 /platform
 *   org_owner/org_admin       → /admin allowed; /platform blocked; /dashboard allowed (read-only)
 *   operational roles         → /dashboard allowed; /platform + /admin blocked
 */
export function decideRoute(
  user: CurrentUser | null,
  pathname: string
): RouteDecision {
  if (isPublic(pathname) && user === null) return { kind: "allow" };

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

  // Channel partners: own dedicated /cp surface + read-only /dashboard.
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

  // Other operational roles: workspace_admin, manager, sales_rep, read_only
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
