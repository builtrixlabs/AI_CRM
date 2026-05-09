import { describe, expect, it } from "vitest";
import { COMMANDS, PLACEHOLDER_SLUGS } from "@/lib/cmdk/catalog";
import { COMMAND_GROUPS, COMMAND_KINDS, ACTION_KEYS } from "@/lib/cmdk/types";
import { PERMISSIONS } from "@/lib/auth/rbac";

describe("COMMANDS catalog", () => {
  it("ships exactly 31 commands (V0 base 30 + nav-admin-directives from D-017)", () => {
    expect(COMMANDS.length).toBe(31);
  });

  it("every id is unique", () => {
    const ids = COMMANDS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every group is one of COMMAND_GROUPS", () => {
    const groups = new Set(COMMAND_GROUPS as readonly string[]);
    for (const c of COMMANDS) {
      expect(groups.has(c.group)).toBe(true);
    }
  });

  it("every kind is one of COMMAND_KINDS", () => {
    const kinds = new Set(COMMAND_KINDS as readonly string[]);
    for (const c of COMMANDS) {
      expect(kinds.has(c.kind)).toBe(true);
    }
  });

  it("every navigate command has a target starting with /", () => {
    const nav = COMMANDS.filter((c) => c.kind === "navigate");
    expect(nav.length).toBeGreaterThan(0);
    for (const c of nav) {
      expect(c.target).toBeTruthy();
      expect(c.target!.startsWith("/")).toBe(true);
    }
  });

  it("every placeholder command targets /dashboard/placeholder/<slug>", () => {
    const placeholders = COMMANDS.filter((c) => c.kind === "placeholder");
    expect(placeholders.length).toBeGreaterThan(0);
    const known = new Set(PLACEHOLDER_SLUGS as readonly string[]);
    for (const c of placeholders) {
      expect(c.target).toBeTruthy();
      const m = c.target!.match(/^\/dashboard\/placeholder\/([^/]+)$/);
      expect(m).not.toBeNull();
      expect(known.has(m![1]!)).toBe(true);
    }
  });

  it("every action command has a known action key", () => {
    const actionSet = new Set(ACTION_KEYS as readonly string[]);
    const actions = COMMANDS.filter((c) => c.kind === "action");
    expect(actions.length).toBeGreaterThan(0);
    for (const c of actions) {
      expect(c.action).toBeTruthy();
      expect(actionSet.has(c.action!)).toBe(true);
    }
  });

  it("every lookup-prefix command has prefix + action", () => {
    const lookups = COMMANDS.filter((c) => c.kind === "lookup-prefix");
    expect(lookups.length).toBeGreaterThan(0);
    for (const c of lookups) {
      expect(c.prefix).toBeTruthy();
      expect(c.action).toBeTruthy();
    }
  });

  it("every requires[] permission is in PERMISSIONS", () => {
    const perms = new Set(PERMISSIONS as readonly string[]);
    for (const c of COMMANDS) {
      if (!c.requires) continue;
      for (const r of c.requires) {
        expect(perms.has(r)).toBe(true);
      }
    }
  });

  it("ids are kebab-case (lowercase + hyphens)", () => {
    for (const c of COMMANDS) {
      expect(c.id).toMatch(/^[a-z][a-z0-9-]*$/);
    }
  });
});

describe("PLACEHOLDER_SLUGS", () => {
  it("has unique entries", () => {
    expect(new Set(PLACEHOLDER_SLUGS).size).toBe(PLACEHOLDER_SLUGS.length);
  });

  it("every placeholder command's slug appears in the set", () => {
    const known = new Set(PLACEHOLDER_SLUGS as readonly string[]);
    const usedSlugs = COMMANDS.filter((c) => c.kind === "placeholder").map(
      (c) => c.target!.replace("/dashboard/placeholder/", ""),
    );
    for (const s of usedSlugs) {
      expect(known.has(s)).toBe(true);
    }
  });
});
