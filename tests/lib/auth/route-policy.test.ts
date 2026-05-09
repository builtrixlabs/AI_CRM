import { describe, expect, it } from "vitest";
import { decideRoute } from "@/lib/auth/route-policy";
import type { CurrentUser } from "@/lib/auth/types";

const u = (base_role: CurrentUser["profile"]["base_role"]): CurrentUser => ({
  user: { id: "u-1", email: "u@example.com" },
  profile: { id: "u-1", display_name: "Test User", base_role },
  org_id: base_role === "super_admin" ? null : "org-1",
  workspace_ids: base_role === "super_admin" ? [] : ["ws-1"],
  app_roles: [],
});

describe("decideRoute — public routes", () => {
  it("AC-7: unauthenticated → /auth/sign-in", () => {
    const d = decideRoute(null, "/dashboard");
    expect(d).toEqual({ kind: "redirect", target: "/auth/sign-in" });
  });

  it("public path /auth/sign-in is allowed when unauthenticated", () => {
    expect(decideRoute(null, "/auth/sign-in")).toEqual({ kind: "allow" });
  });

  it("authenticated user hitting / is redirected to their landing", () => {
    expect(decideRoute(u("super_admin"), "/")).toEqual({
      kind: "redirect",
      target: "/platform",
    });
    expect(decideRoute(u("org_admin"), "/")).toEqual({
      kind: "redirect",
      target: "/admin",
    });
    expect(decideRoute(u("sales_rep"), "/")).toEqual({
      kind: "redirect",
      target: "/dashboard",
    });
  });
});

describe("decideRoute — super_admin (AC-1, AC-2)", () => {
  it("super_admin on /platform is allowed", () => {
    expect(decideRoute(u("super_admin"), "/platform")).toEqual({ kind: "allow" });
  });
  it("super_admin on /dashboard → /platform", () => {
    expect(decideRoute(u("super_admin"), "/dashboard")).toEqual({
      kind: "redirect",
      target: "/platform",
    });
  });
  it("super_admin on /admin → /platform", () => {
    expect(decideRoute(u("super_admin"), "/admin")).toEqual({
      kind: "redirect",
      target: "/platform",
    });
  });
});

describe("decideRoute — org_admin (AC-3)", () => {
  it("org_admin on /admin is allowed", () => {
    expect(decideRoute(u("org_admin"), "/admin")).toEqual({ kind: "allow" });
  });
  it("org_admin on /settings is allowed", () => {
    expect(decideRoute(u("org_admin"), "/settings/users")).toEqual({
      kind: "allow",
    });
  });
  it("org_admin on /platform → /admin", () => {
    expect(decideRoute(u("org_admin"), "/platform")).toEqual({
      kind: "redirect",
      target: "/admin",
    });
  });
  it("org_admin on /dashboard is allowed (read-only by default)", () => {
    expect(decideRoute(u("org_admin"), "/dashboard")).toEqual({ kind: "allow" });
  });
});

describe("decideRoute — operational (AC-4, AC-5)", () => {
  it("sales_rep on /dashboard is allowed", () => {
    expect(decideRoute(u("sales_rep"), "/dashboard")).toEqual({ kind: "allow" });
  });
  it("sales_rep on /platform → /dashboard", () => {
    expect(decideRoute(u("sales_rep"), "/platform")).toEqual({
      kind: "redirect",
      target: "/dashboard",
    });
  });
  it("sales_rep on /admin → /dashboard", () => {
    expect(decideRoute(u("sales_rep"), "/admin")).toEqual({
      kind: "redirect",
      target: "/dashboard",
    });
  });
  it("manager on /dashboard is allowed", () => {
    expect(decideRoute(u("manager"), "/dashboard")).toEqual({ kind: "allow" });
  });
  it("workspace_admin on /admin → /dashboard (account plane is org_admin only)", () => {
    expect(decideRoute(u("workspace_admin"), "/admin")).toEqual({
      kind: "redirect",
      target: "/dashboard",
    });
  });
});

describe("decideRoute — channel_partner (AC-6)", () => {
  it("channel_partner on /dashboard is allowed", () => {
    expect(decideRoute(u("channel_partner"), "/dashboard")).toEqual({
      kind: "allow",
    });
  });
  it("channel_partner on /admin → /cp (D-221)", () => {
    expect(decideRoute(u("channel_partner"), "/admin")).toEqual({
      kind: "redirect",
      target: "/cp",
    });
  });
  it("channel_partner on /platform → /cp (D-221)", () => {
    expect(decideRoute(u("channel_partner"), "/platform")).toEqual({
      kind: "redirect",
      target: "/cp",
    });
  });
  it("channel_partner on /cp is allowed (D-221)", () => {
    expect(decideRoute(u("channel_partner"), "/cp")).toEqual({
      kind: "allow",
    });
  });
  it("channel_partner on /cp/submit is allowed (D-221)", () => {
    expect(decideRoute(u("channel_partner"), "/cp/submit")).toEqual({
      kind: "allow",
    });
  });
  it("non-CP operational role on /cp → /dashboard (D-221)", () => {
    expect(decideRoute(u("sales_rep"), "/cp")).toEqual({
      kind: "redirect",
      target: "/dashboard",
    });
  });

  it("unauthenticated /api/* is allowed through (HMAC/Bearer/none-required at the handler)", () => {
    expect(decideRoute(null, "/api/events/inbox")).toEqual({ kind: "allow" });
    expect(decideRoute(null, "/api/auth/rate-check")).toEqual({ kind: "allow" });
    expect(decideRoute(null, "/api/admin/leads/lookup")).toEqual({ kind: "allow" });
  });
});

describe("decideRoute — service_account (AC-8)", () => {
  it("service_account on UI route returns 401", () => {
    expect(decideRoute(u("service_account"), "/dashboard")).toEqual({
      kind: "unauthorized",
    });
    expect(decideRoute(u("service_account"), "/admin")).toEqual({
      kind: "unauthorized",
    });
    expect(decideRoute(u("service_account"), "/platform")).toEqual({
      kind: "unauthorized",
    });
  });
  it("service_account on API route is allowed (only blocked from UI)", () => {
    expect(decideRoute(u("service_account"), "/api/leads")).toEqual({
      kind: "allow",
    });
  });
});

describe("decideRoute — auth flow paths bypass redirect", () => {
  it("any authenticated user on /auth/callback is allowed (must complete OAuth)", () => {
    expect(decideRoute(u("sales_rep"), "/auth/callback")).toEqual({ kind: "allow" });
  });
  it("any authenticated user on /403 is allowed", () => {
    expect(decideRoute(u("sales_rep"), "/403")).toEqual({ kind: "allow" });
  });
});

describe("decideRoute — unknown paths fall back to landing", () => {
  it("org_admin on an unknown path → /admin", () => {
    expect(decideRoute(u("org_admin"), "/unknown-surface")).toEqual({
      kind: "redirect",
      target: "/admin",
    });
  });
  it("sales_rep on an unknown path → /dashboard", () => {
    expect(decideRoute(u("sales_rep"), "/unknown-surface")).toEqual({
      kind: "redirect",
      target: "/dashboard",
    });
  });
});
