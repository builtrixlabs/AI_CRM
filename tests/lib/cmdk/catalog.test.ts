import { describe, expect, it } from "vitest";
import { COMMANDS } from "@/lib/cmdk/catalog";
import { COMMAND_GROUPS, COMMAND_KINDS, ACTION_KEYS } from "@/lib/cmdk/types";
import { PERMISSIONS } from "@/lib/auth/rbac";

describe("COMMANDS catalog", () => {
  it("ships exactly 33 commands (D-617 resolved the 12 placeholders + removed account-keyboard-shortcuts)", () => {
    expect(COMMANDS.length).toBe(33);
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

  it("D-617 — no command has the removed `placeholder` kind", () => {
    expect(
      COMMANDS.some((c) => (c.kind as string) === "placeholder"),
    ).toBe(false);
  });

  it("every navigate command has a target starting with /", () => {
    const nav = COMMANDS.filter((c) => c.kind === "navigate");
    expect(nav.length).toBeGreaterThan(0);
    for (const c of nav) {
      expect(c.target).toBeTruthy();
      expect(c.target!.startsWith("/")).toBe(true);
    }
  });

  it("D-617 — no command targets the removed /dashboard/placeholder route", () => {
    for (const c of COMMANDS) {
      if (c.kind === "navigate" && c.target) {
        expect(c.target.includes("/dashboard/placeholder/")).toBe(false);
      }
    }
  });

  it("D-617 — the 8 lead-filter shortcuts navigate to /dashboard/leads?canned=", () => {
    const ids = [
      "lead-show-hot",
      "lead-show-new",
      "lead-show-contacted",
      "lead-show-qualified",
      "lead-show-terminal",
      "lead-source-magicbricks",
      "lead-source-99acres",
      "lead-source-walkin",
    ];
    for (const id of ids) {
      const c = COMMANDS.find((x) => x.id === id);
      expect(c, `command ${id} should exist`).toBeDefined();
      expect(c!.kind).toBe("navigate");
      expect(c!.target).toMatch(/^\/dashboard\/leads\?canned=/);
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
