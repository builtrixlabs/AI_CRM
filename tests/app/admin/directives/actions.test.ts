import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  resolveForUser: vi.fn(),
  toggleDirective: vi.fn(),
  createCustomDirective: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth/getCurrentUser", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));
vi.mock("@/lib/auth/permissions", async () => {
  const actual = await vi.importActual<object>("@/lib/auth/permissions");
  return {
    ...actual,
    resolveForUser: mocks.resolveForUser,
  };
});
vi.mock("@/lib/doe/authoring", async () => {
  const actual = await vi.importActual<object>("@/lib/doe/authoring");
  return {
    ...actual,
    toggleDirective: mocks.toggleDirective,
    createCustomDirective: mocks.createCustomDirective,
  };
});
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { directiveAction } from "@/app/(admin)/admin/directives/actions";
import { DirectiveAuthoringError } from "@/lib/doe/authoring";

const ORG = "11111111-2222-4333-8444-555555555555";
const USER = "22222222-3333-4444-8555-666666666666";

const SIGNED_IN_ADMIN = {
  user: { id: USER, email: "admin@example.com" },
  profile: { id: USER, display_name: "Admin", base_role: "org_admin" },
  org_id: ORG,
  workspace_ids: [],
  app_roles: [],
};

beforeEach(() => {
  for (const k of Object.keys(mocks) as (keyof typeof mocks)[]) {
    const m = mocks[k];
    if (
      m != null &&
      typeof (m as { mockReset?: unknown }).mockReset === "function"
    ) {
      (m as { mockReset: () => void }).mockReset();
    }
  }
  mocks.getCurrentUser.mockResolvedValue(SIGNED_IN_ADMIN);
  mocks.resolveForUser.mockReturnValue(new Set(["directives:author"]));
});

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.append(k, v);
  return f;
}

describe("directiveAction — permission gate", () => {
  it("returns permission error when unauthenticated", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const r = await directiveAction(
      fd({ intent: "toggle", code: "D-09", enabled: "true" }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("permission");
  });

  it("returns permission error when user lacks directives:author", async () => {
    mocks.resolveForUser.mockReturnValue(new Set(["leads:view"]));
    const r = await directiveAction(
      fd({ intent: "toggle", code: "D-09", enabled: "true" }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("permission");
  });

  it("returns validation error when user has no org", async () => {
    mocks.getCurrentUser.mockResolvedValue({ ...SIGNED_IN_ADMIN, org_id: null });
    const r = await directiveAction(
      fd({ intent: "toggle", code: "D-09", enabled: "true" }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("validation");
  });

  it("returns validation error for unknown intent", async () => {
    const r = await directiveAction(fd({ intent: "explode" }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe("validation");
      expect(r.message).toMatch(/explode/i);
    }
  });
});

describe("directiveAction — toggle", () => {
  it("calls toggleDirective with caller_org_id and returns its result", async () => {
    mocks.toggleDirective.mockResolvedValue({
      id: "abc",
      code: "D-09",
      enabled: false,
    });
    const r = await directiveAction(
      fd({ intent: "toggle", code: "D-09", enabled: "false" }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toEqual({ id: "abc", code: "D-09", enabled: false });
    expect(mocks.toggleDirective).toHaveBeenCalledWith({
      caller_org_id: ORG,
      actor_id: USER,
      actor_role: "org_admin",
      code: "D-09",
      enabled: false,
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/directives");
  });

  it("maps toggleDirective not_found to validation (no existence leak)", async () => {
    mocks.toggleDirective.mockRejectedValue(
      new DirectiveAuthoringError("Directive not found: D-09", "not_found"),
    );
    const r = await directiveAction(
      fd({ intent: "toggle", code: "D-09", enabled: "false" }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe("validation");
      expect(r.message).toBe("Directive not found");
    }
  });

  it("returns validation when code is empty", async () => {
    const r = await directiveAction(
      fd({ intent: "toggle", code: "", enabled: "true" }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("validation");
    expect(mocks.toggleDirective).not.toHaveBeenCalled();
  });

  it("treats 'on' / '1' / 'true' as enabled=true and anything else as false", async () => {
    mocks.toggleDirective.mockResolvedValue({ id: "x", code: "D-09", enabled: true });
    await directiveAction(fd({ intent: "toggle", code: "D-09", enabled: "on" }));
    expect(mocks.toggleDirective).toHaveBeenLastCalledWith(
      expect.objectContaining({ enabled: true }),
    );
    await directiveAction(fd({ intent: "toggle", code: "D-09", enabled: "no" }));
    expect(mocks.toggleDirective).toHaveBeenLastCalledWith(
      expect.objectContaining({ enabled: false }),
    );
  });

  it("returns unknown for non-DirectiveAuthoringError throws", async () => {
    mocks.toggleDirective.mockRejectedValue(new Error("DB on fire"));
    const r = await directiveAction(
      fd({ intent: "toggle", code: "D-09", enabled: "true" }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe("unknown");
      expect(r.message).toBe("DB on fire");
    }
  });
});

describe("directiveAction — create", () => {
  it("creates a custom directive on a valid form", async () => {
    mocks.createCustomDirective.mockResolvedValue({ id: "new-id", code: "C-01" });
    const r = await directiveAction(
      fd({
        intent: "create",
        display_name: "Notify on hot lead",
        trigger_kind: "lead.intent_crossed",
        trigger_config: '{"threshold":80}',
        action_kind: "notify_user",
        action_config: '{"audience":"rep"}',
        enabled: "true",
      }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toEqual({ id: "new-id", code: "C-01" });
    expect(mocks.createCustomDirective).toHaveBeenCalledWith({
      caller_org_id: ORG,
      actor_id: USER,
      actor_role: "org_admin",
      input: expect.objectContaining({
        display_name: "Notify on hot lead",
        trigger_kind: "lead.intent_crossed",
        action_kind: "notify_user",
        trigger_config: { threshold: 80 },
        action_config: { audience: "rep" },
      }),
    });
  });

  it("returns validation with fieldErrors on missing required fields", async () => {
    const r = await directiveAction(fd({ intent: "create", display_name: "" }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe("validation");
      expect(r.fieldErrors).toBeTruthy();
    }
    expect(mocks.createCustomDirective).not.toHaveBeenCalled();
  });

  it("rejects invalid trigger_config JSON silently (defaults to {})", async () => {
    mocks.createCustomDirective.mockResolvedValue({ id: "id", code: "C-01" });
    const r = await directiveAction(
      fd({
        intent: "create",
        display_name: "Test",
        trigger_kind: "lead.created",
        trigger_config: "not-json",
        action_kind: "flag_lead",
      }),
    );
    expect(r.ok).toBe(true);
    expect(mocks.createCustomDirective).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({ trigger_config: {} }),
      }),
    );
  });

  it("forwards an explicit tier when provided (T3 queue-bound)", async () => {
    mocks.createCustomDirective.mockResolvedValue({ id: "id", code: "C-01" });
    await directiveAction(
      fd({
        intent: "create",
        display_name: "Auto-call escalation",
        trigger_kind: "lead.intent_crossed",
        action_kind: "enqueue_agent",
        tier: "T3",
      }),
    );
    expect(mocks.createCustomDirective).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({ tier: "T3" }),
      }),
    );
  });
});
