import { describe, expect, it } from "vitest";
import {
  effectivePermissions,
  PLATFORM_ONLY_PERMISSIONS,
} from "@/lib/auth/rbac";

describe("effectivePermissions — base layer (A1)", () => {
  it("super_admin base contains platform:manage", () => {
    const perms = effectivePermissions({
      base_role: "super_admin",
      bridge_app_roles: [],
      org_allow_overrides: [],
      org_deny_overrides: [],
    });
    expect(perms.has("platform:manage")).toBe(true);
  });

  it("sales_rep base contains leads:view but not platform:manage", () => {
    const perms = effectivePermissions({
      base_role: "sales_rep",
      bridge_app_roles: [],
      org_allow_overrides: [],
      org_deny_overrides: [],
    });
    expect(perms.has("leads:view")).toBe(true);
    expect(perms.has("platform:manage")).toBe(false);
  });

  it("read_only base contains read perms but no write perms", () => {
    const perms = effectivePermissions({
      base_role: "read_only",
      bridge_app_roles: [],
      org_allow_overrides: [],
      org_deny_overrides: [],
    });
    expect(perms.has("leads:view")).toBe(true);
    expect(perms.has("leads:create")).toBe(false);
  });

  it("service_account base is empty (tier-bound, set per-agent in D-009)", () => {
    const perms = effectivePermissions({
      base_role: "service_account",
      bridge_app_roles: [],
      org_allow_overrides: [],
      org_deny_overrides: [],
    });
    expect(perms.size).toBe(0);
  });
});

describe("effectivePermissions — bridge UNION (A2)", () => {
  it("bridge app_roles add their permissions to a sales_rep base", () => {
    const baseOnly = effectivePermissions({
      base_role: "sales_rep",
      bridge_app_roles: [],
      org_allow_overrides: [],
      org_deny_overrides: [],
    });
    const withBridge = effectivePermissions({
      base_role: "sales_rep",
      bridge_app_roles: ["workspace_admin"],
      org_allow_overrides: [],
      org_deny_overrides: [],
    });
    // workspace_admin grants the team-management permission set
    expect(withBridge.size).toBeGreaterThan(baseOnly.size);
    expect(withBridge.has("agents:approve_T3")).toBe(true);
    expect(baseOnly.has("agents:approve_T3")).toBe(false);
  });

  it("multiple bridge roles UNION together", () => {
    const perms = effectivePermissions({
      base_role: "sales_rep",
      bridge_app_roles: ["manager", "workspace_admin"],
      org_allow_overrides: [],
      org_deny_overrides: [],
    });
    // both roles' perms present
    expect(perms.has("agents:approve_T3")).toBe(true); // workspace_admin
    expect(perms.has("audit:view")).toBe(true); // manager
  });
});

describe("effectivePermissions — overrides + deny-wins (A3)", () => {
  it("allow override grants a perm not in base", () => {
    const perms = effectivePermissions({
      base_role: "sales_rep",
      bridge_app_roles: [],
      org_allow_overrides: ["leads:bulk_import"],
      org_deny_overrides: [],
    });
    expect(perms.has("leads:bulk_import")).toBe(true);
  });

  it("deny override removes a perm even if base+bridge had it", () => {
    const perms = effectivePermissions({
      base_role: "sales_rep",
      bridge_app_roles: [],
      org_allow_overrides: [],
      org_deny_overrides: ["leads:view"],
    });
    expect(perms.has("leads:view")).toBe(false);
  });

  it("deny wins over allow on the same perm", () => {
    const perms = effectivePermissions({
      base_role: "sales_rep",
      bridge_app_roles: [],
      org_allow_overrides: ["leads:bulk_import"],
      org_deny_overrides: ["leads:bulk_import"],
    });
    expect(perms.has("leads:bulk_import")).toBe(false);
  });
});

describe("effectivePermissions — PLATFORM_ONLY guard (A4)", () => {
  it("PLATFORM_ONLY_PERMISSIONS includes platform:manage", () => {
    expect(PLATFORM_ONLY_PERMISSIONS.has("platform:manage")).toBe(true);
  });

  it("allow-override on a PLATFORM_ONLY perm is silently filtered", () => {
    const perms = effectivePermissions({
      base_role: "org_admin",
      bridge_app_roles: [],
      org_allow_overrides: ["platform:manage"],
      org_deny_overrides: [],
    });
    expect(perms.has("platform:manage")).toBe(false);
  });

  it("super_admin retains platform:manage even when filter runs", () => {
    const perms = effectivePermissions({
      base_role: "super_admin",
      bridge_app_roles: [],
      org_allow_overrides: [],
      org_deny_overrides: [],
    });
    expect(perms.has("platform:manage")).toBe(true);
  });
});
