import { describe, expect, it } from "vitest";
import {
  hasPermission,
  PermissionDenied,
  requireAnyOf,
  requirePermission,
  resolveForUser,
} from "@/lib/auth/permissions";
import type { CurrentUser } from "@/lib/auth/types";

const makeUser = (
  base_role: CurrentUser["profile"]["base_role"] = "sales_rep",
  app_roles: CurrentUser["app_roles"] = []
): CurrentUser => ({
  user: { id: "u-1", email: "rep@example.com" },
  profile: { id: "u-1", display_name: "Rep One", base_role },
  org_id: base_role === "super_admin" ? null : "org-1",
  workspace_ids: ["ws-1"],
  app_roles,
});

describe("hasPermission", () => {
  it("returns true for a base permission the role holds", () => {
    expect(hasPermission(makeUser("sales_rep"), "leads:view")).toBe(true);
  });

  it("returns false for a permission outside the role's set", () => {
    expect(hasPermission(makeUser("sales_rep"), "platform:manage")).toBe(false);
    expect(hasPermission(makeUser("sales_rep"), "agents:approve_T2")).toBe(false);
  });

  it("uses the cached set when supplied (does not re-resolve)", () => {
    const set = new Set(["leads:view"] as const);
    // sales_rep doesn't have agents:approve_T2 in base, but cached set
    // is the source of truth here.
    expect(
      hasPermission(makeUser("sales_rep"), "agents:approve_T2", set as never)
    ).toBe(false);
    expect(hasPermission(makeUser("sales_rep"), "leads:view", set as never)).toBe(
      true
    );
  });
});

describe("requirePermission", () => {
  it("returns void when the user has the permission", () => {
    expect(() =>
      requirePermission(makeUser("sales_rep"), "leads:view")
    ).not.toThrow();
  });

  it("throws PermissionDenied when the user lacks it", () => {
    const user = makeUser("sales_rep");
    try {
      requirePermission(user, "platform:manage");
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(PermissionDenied);
      const e = err as PermissionDenied;
      expect(e.user_id).toBe("u-1");
      expect(e.perm).toBe("platform:manage");
      expect(e.org_id).toBe("org-1");
      expect(e.message).toMatch(/PermissionDenied.*platform:manage/);
    }
  });
});

describe("requireAnyOf", () => {
  it("returns the first matched permission", () => {
    const user = makeUser("sales_rep");
    const matched = requireAnyOf(user, [
      "platform:manage",
      "leads:view",
      "leads:create",
    ]);
    expect(matched).toBe("leads:view");
  });

  it("throws PermissionDenied with the LAST perm if none match", () => {
    try {
      requireAnyOf(makeUser("sales_rep"), [
        "platform:manage",
        "agents:approve_T3",
      ]);
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(PermissionDenied);
      expect((err as PermissionDenied).perm).toBe("agents:approve_T3");
    }
  });

  it("throws on empty perms list (programmer error)", () => {
    expect(() => requireAnyOf(makeUser(), [])).toThrow(/empty perms list/);
  });
});

describe("resolveForUser", () => {
  it("UNIONs base + app_roles correctly", () => {
    const user = makeUser("sales_rep", [
      { workspace_id: "ws-1", app_role: "manager" },
    ]);
    const set = resolveForUser(user);
    expect(set.has("leads:view")).toBe(true);
    expect(set.has("calls:listen")).toBe(true); // manager perm
  });

  it("applies allow + deny overrides; deny wins", () => {
    const user = makeUser("sales_rep");
    const set = resolveForUser(
      user,
      ["leads:bulk_import"],
      ["leads:view"]
    );
    expect(set.has("leads:bulk_import")).toBe(true);
    expect(set.has("leads:view")).toBe(false);
  });

  it("allow on PLATFORM_ONLY is silently filtered for non-super_admin", () => {
    const user = makeUser("org_admin");
    const set = resolveForUser(user, ["platform:manage"], []);
    expect(set.has("platform:manage")).toBe(false);
  });
});
