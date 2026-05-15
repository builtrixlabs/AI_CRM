import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  resolveForUser: vi.fn(),
  approveWorkflow: vi.fn(),
  rejectWorkflow: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(() => {
    throw new Error("REDIRECT");
  }),
}));

vi.mock("@/lib/auth/getCurrentUser", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));
vi.mock("@/lib/auth/permissions", async () => {
  const actual = await vi.importActual<object>("@/lib/auth/permissions");
  return { ...actual, resolveForUser: mocks.resolveForUser };
});
vi.mock("@/lib/doe/authoring", async () => {
  const actual = await vi.importActual<object>("@/lib/doe/authoring");
  return {
    ...actual,
    approveWorkflow: mocks.approveWorkflow,
    rejectWorkflow: mocks.rejectWorkflow,
  };
});
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import {
  approveWorkflowAction,
  rejectWorkflowAction,
} from "@/app/(admin)/admin/directives/pending/actions";
import { DirectiveAuthoringError } from "@/lib/doe/authoring";

const ORG = "11111111-2222-4333-8444-555555555555";
const USER = "44444444-2222-4333-8444-555555555555";

function asUser() {
  return {
    user: { id: USER, email: "u@example.com" },
    profile: { id: USER, display_name: "U", base_role: "org_admin" },
    org_id: ORG,
    workspace_ids: [],
    app_roles: [],
  };
}

beforeEach(() => {
  for (const m of Object.values(mocks)) {
    if (typeof m.mockReset === "function") m.mockReset();
  }
  mocks.redirect.mockImplementation(() => {
    throw new Error("REDIRECT");
  });
});

describe("approveWorkflowAction", () => {
  it("rejects a caller without directives:approve (AC-7)", async () => {
    mocks.getCurrentUser.mockResolvedValue(asUser());
    mocks.resolveForUser.mockReturnValue(new Set<string>());
    const r = await approveWorkflowAction("dir-1");
    expect(r).toEqual({ ok: false, error: "permission" });
    expect(mocks.approveWorkflow).not.toHaveBeenCalled();
  });

  it("approves and revalidates on success", async () => {
    mocks.getCurrentUser.mockResolvedValue(asUser());
    mocks.resolveForUser.mockReturnValue(new Set(["directives:approve"]));
    mocks.approveWorkflow.mockResolvedValue({
      id: "dir-1",
      code: "C-07",
      lifecycle_status: "live",
    });
    const r = await approveWorkflowAction("dir-1");
    expect(r).toEqual({ ok: true });
    expect(mocks.approveWorkflow).toHaveBeenCalledWith({
      caller_org_id: ORG,
      actor_id: USER,
      actor_role: "org_admin",
      directive_id: "dir-1",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      "/admin/directives/pending",
    );
  });

  it("maps a conflict error from approveWorkflow", async () => {
    mocks.getCurrentUser.mockResolvedValue(asUser());
    mocks.resolveForUser.mockReturnValue(new Set(["directives:approve"]));
    mocks.approveWorkflow.mockRejectedValue(
      new DirectiveAuthoringError("not pending", "conflict"),
    );
    const r = await approveWorkflowAction("dir-1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("conflict");
  });

  it("maps a not_found error from approveWorkflow", async () => {
    mocks.getCurrentUser.mockResolvedValue(asUser());
    mocks.resolveForUser.mockReturnValue(new Set(["directives:approve"]));
    mocks.approveWorkflow.mockRejectedValue(
      new DirectiveAuthoringError("not found", "not_found"),
    );
    const r = await approveWorkflowAction("dir-1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("not_found");
  });
});

describe("rejectWorkflowAction", () => {
  it("rejects a caller without directives:approve", async () => {
    mocks.getCurrentUser.mockResolvedValue(asUser());
    mocks.resolveForUser.mockReturnValue(new Set<string>());
    const r = await rejectWorkflowAction("dir-1", "a perfectly valid reason");
    expect(r).toEqual({ ok: false, error: "permission" });
    expect(mocks.rejectWorkflow).not.toHaveBeenCalled();
  });

  it("rejects and revalidates on success", async () => {
    mocks.getCurrentUser.mockResolvedValue(asUser());
    mocks.resolveForUser.mockReturnValue(new Set(["directives:approve"]));
    mocks.rejectWorkflow.mockResolvedValue({
      id: "dir-1",
      code: "C-07",
      lifecycle_status: "archived",
    });
    const r = await rejectWorkflowAction("dir-1", "a perfectly valid reason");
    expect(r).toEqual({ ok: true });
    expect(mocks.rejectWorkflow).toHaveBeenCalledWith({
      caller_org_id: ORG,
      actor_id: USER,
      actor_role: "org_admin",
      directive_id: "dir-1",
      reason: "a perfectly valid reason",
    });
  });

  it("maps a too-short-reason validation error", async () => {
    mocks.getCurrentUser.mockResolvedValue(asUser());
    mocks.resolveForUser.mockReturnValue(new Set(["directives:approve"]));
    mocks.rejectWorkflow.mockRejectedValue(
      new DirectiveAuthoringError("reason too short", "invalid"),
    );
    const r = await rejectWorkflowAction("dir-1", "short");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("validation");
  });
});
