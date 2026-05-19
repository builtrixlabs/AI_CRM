import { describe, expect, it } from "vitest";
import { formatRoleLabel, resolveRoleTier } from "@/lib/auth/role-tier";
import type { BaseRole } from "@/lib/auth/types";

describe("resolveRoleTier", () => {
  it.each<[BaseRole, ReturnType<typeof resolveRoleTier>]>([
    ["super_admin", "admin"],
    ["org_owner", "admin"],
    ["org_admin", "admin"],
    ["workspace_admin", "admin"],
    ["manager", "manager"],
    ["sales_rep", "agent"],
    ["presales_rep", "agent"],
    ["telemarketing_rep", "agent"],
    ["customer_recovery_rep", "agent"],
    ["site_visit_coordinator", "agent"],
    ["read_only", "agent"],
    ["channel_partner", "agent"],
    ["service_account", "agent"],
  ])("classifies %s as %s", (role, expected) => {
    expect(resolveRoleTier(role)).toBe(expected);
  });

  it("falls back to agent for null/undefined", () => {
    expect(resolveRoleTier(null)).toBe("agent");
    expect(resolveRoleTier(undefined)).toBe("agent");
  });
});

describe("formatRoleLabel", () => {
  it("uses curated labels for known roles", () => {
    expect(formatRoleLabel("super_admin")).toBe("Super Admin");
    expect(formatRoleLabel("presales_rep")).toBe("Presales Rep");
    expect(formatRoleLabel("site_visit_coordinator")).toBe(
      "Site Visit Coordinator",
    );
  });

  it("title-cases unknown snake_case roles", () => {
    // Cast — exercises the fallback branch for forward-compat with roles
    // added to the union before this map is updated.
    expect(formatRoleLabel("future_role_name" as BaseRole)).toBe(
      "Future Role Name",
    );
  });

  it("returns Member for null", () => {
    expect(formatRoleLabel(null)).toBe("Member");
  });
});
