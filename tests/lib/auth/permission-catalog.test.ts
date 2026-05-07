import { describe, expect, it } from "vitest";
import {
  APP_ROLE_PERMS,
  BASE_ROLE_PERMS,
  PERMISSIONS,
  PLATFORM_ONLY_PERMISSIONS,
} from "@/lib/auth/rbac";
import { BASE_ROLES, GRANTABLE_APP_ROLES } from "@/lib/auth/types";

describe("permission catalog — shape + completeness", () => {
  it("exports a non-empty PERMISSIONS array (stable-core ≥ 60)", () => {
    expect(PERMISSIONS.length).toBeGreaterThanOrEqual(60);
  });

  it("PERMISSIONS has no duplicates", () => {
    expect(new Set(PERMISSIONS).size).toBe(PERMISSIONS.length);
  });

  it("PLATFORM_ONLY_PERMISSIONS ⊂ PERMISSIONS", () => {
    const perms = new Set<string>(PERMISSIONS);
    for (const p of PLATFORM_ONLY_PERMISSIONS) {
      expect(perms.has(p)).toBe(true);
    }
  });

  it("PLATFORM_ONLY_PERMISSIONS covers every platform-tier permission", () => {
    // Per PRD §4.2 — these MUST be in PLATFORM_ONLY for D-003.
    const required = [
      "platform:manage",
      "organizations:create",
      "organizations:delete",
      "organizations:manage_admins",
      "organizations:manage_subscriptions",
      "platform_analytics:view",
      "platform_tickets:view",
      "platform_tickets:respond",
    ];
    for (const p of required) {
      expect(PLATFORM_ONLY_PERMISSIONS.has(p as never)).toBe(true);
    }
  });
});

describe("permission catalog — every perm is referenced", () => {
  it("every PERMISSION appears in at least one BASE_ROLE_PERMS or APP_ROLE_PERMS", () => {
    const referenced = new Set<string>();
    for (const role of BASE_ROLES) {
      for (const p of BASE_ROLE_PERMS[role]) referenced.add(p);
    }
    for (const role of GRANTABLE_APP_ROLES) {
      for (const p of APP_ROLE_PERMS[role]) referenced.add(p);
    }
    const orphans = PERMISSIONS.filter((p) => !referenced.has(p));
    expect(orphans).toEqual([]);
  });
});

describe("permission catalog — every base role has a sensible footprint", () => {
  it("super_admin holds platform perms but no operational write perms", () => {
    const perms = BASE_ROLE_PERMS.super_admin;
    expect(perms.has("platform:manage")).toBe(true);
    expect(perms.has("leads:create")).toBe(false);
    expect(perms.has("deals:close_won")).toBe(false);
  });

  it("service_account base is empty (set per agent)", () => {
    expect(BASE_ROLE_PERMS.service_account.size).toBe(0);
  });

  it("read_only has views but no writes", () => {
    const perms = BASE_ROLE_PERMS.read_only;
    expect(perms.has("leads:view")).toBe(true);
    expect(perms.has("deals:view")).toBe(true);
    expect(perms.has("leads:create")).toBe(false);
    expect(perms.has("deals:close_won")).toBe(false);
  });

  it("channel_partner can submit but cannot view others' submissions", () => {
    const perms = BASE_ROLE_PERMS.channel_partner;
    expect(perms.has("cp:submit_lead")).toBe(true);
    expect(perms.has("cp:view_own_submissions")).toBe(true);
    expect(perms.has("leads:view")).toBe(false);
  });
});
