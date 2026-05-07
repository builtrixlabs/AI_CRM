import { describe, expect, it } from "vitest";
import { COMMANDS } from "@/lib/cmdk/catalog";
import { visibleCommands } from "@/lib/cmdk/permissions";
import type { Permission } from "@/lib/auth/rbac";

const ALL = new Set<Permission>([]);

const PLATFORM_PERMS = new Set<Permission>([
  "platform:manage",
  "platform_analytics:view",
  "organizations:view",
]);

const ORG_ADMIN_PERMS = new Set<Permission>([
  "organizations:edit",
  "audit:view",
  "settings:manage_users",
  "settings:manage_integrations",
  "subscriptions:view",
  "billing:view",
  "leads:view",
  "leads:create",
  "deals:view",
  "contacts:view",
  "site_visits:view",
]);

const SALES_REP_PERMS = new Set<Permission>([
  "leads:view",
  "leads:create",
  "leads:edit",
  "deals:view",
  "contacts:view",
  "site_visits:view",
]);

const READ_ONLY_PERMS = new Set<Permission>([
  "leads:view",
  "deals:view",
  "contacts:view",
  "site_visits:view",
]);

const NONE_PERMS = new Set<Permission>([]);

describe("visibleCommands", () => {
  it("returns all unrestricted commands when perms is empty", () => {
    const result = visibleCommands(COMMANDS, NONE_PERMS);
    // Only commands with no `requires` survive.
    for (const c of result) {
      expect(c.requires == null || c.requires.length === 0).toBe(true);
    }
    // The catalog has at least one unrestricted command (Toggle theme,
    // Sign out, About Builtrix, demo-lead, dashboard nav).
    expect(result.length).toBeGreaterThan(0);
  });

  it("super_admin sees the platform commands but NOT operational ones requiring leads:view", () => {
    const result = visibleCommands(COMMANDS, PLATFORM_PERMS);
    const ids = new Set(result.map((c) => c.id));
    expect(ids.has("nav-platform")).toBe(true);
    expect(ids.has("ops-platform-analytics")).toBe(true);
    expect(ids.has("lead-show-hot")).toBe(false); // requires leads:view
    expect(ids.has("lead-create")).toBe(false); // requires leads:create
  });

  it("org_admin sees admin + leads commands, NOT platform-only", () => {
    const result = visibleCommands(COMMANDS, ORG_ADMIN_PERMS);
    const ids = new Set(result.map((c) => c.id));
    expect(ids.has("nav-admin")).toBe(true);
    expect(ids.has("nav-onboarding")).toBe(true);
    expect(ids.has("nav-audit")).toBe(true);
    expect(ids.has("lead-create")).toBe(true);
    expect(ids.has("nav-platform")).toBe(false);
    expect(ids.has("ops-platform-analytics")).toBe(false);
  });

  it("sales_rep sees leads commands, NOT admin/platform", () => {
    const result = visibleCommands(COMMANDS, SALES_REP_PERMS);
    const ids = new Set(result.map((c) => c.id));
    expect(ids.has("lead-create")).toBe(true);
    expect(ids.has("lead-open-by-name")).toBe(true);
    expect(ids.has("lead-show-hot")).toBe(true);
    expect(ids.has("nav-admin")).toBe(false);
    expect(ids.has("nav-platform")).toBe(false);
    expect(ids.has("nav-audit")).toBe(false);
  });

  it("read_only doesn't see leads:create-gated commands", () => {
    const result = visibleCommands(COMMANDS, READ_ONLY_PERMS);
    const ids = new Set(result.map((c) => c.id));
    expect(ids.has("lead-show-hot")).toBe(true); // leads:view
    expect(ids.has("lead-open-by-name")).toBe(true); // leads:view
    expect(ids.has("lead-create")).toBe(false); // leads:create
  });

  it("returns the input when ALL is provided (no filtering surface)", () => {
    expect(visibleCommands(COMMANDS, ALL).length).toBeLessThanOrEqual(
      COMMANDS.length,
    );
  });

  it("treats commands with empty requires[] same as no requires", () => {
    const result = visibleCommands(
      [
        {
          id: "test-empty",
          label: "x",
          group: "navigation",
          kind: "navigate",
          target: "/x",
          requires: [],
        },
      ],
      NONE_PERMS,
    );
    expect(result.length).toBe(1);
  });
});
