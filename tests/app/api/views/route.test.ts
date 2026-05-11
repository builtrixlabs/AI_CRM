/**
 * D-413 AC-7 — programmatic dispatcher API for custom views.
 * Tests the POST handler at /api/views.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  resolveForUser: vi.fn(),
  createView: vi.fn(),
  updateView: vi.fn(),
  deleteView: vi.fn(),
  setDefaultView: vi.fn(),
}));

vi.mock("@/lib/auth/getCurrentUser", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));
vi.mock("@/lib/auth/permissions", () => ({
  resolveForUser: mocks.resolveForUser,
}));
vi.mock("@/lib/views/admin", () => ({
  createView: mocks.createView,
  updateView: mocks.updateView,
  deleteView: mocks.deleteView,
  setDefaultView: mocks.setDefaultView,
}));

import { POST } from "@/app/api/views/route";

const ORG = "11111111-2222-4333-8444-555555555555";
const USER = "22222222-3333-4444-8555-666666666666";
const VIEW_ID = "99999999-aaaa-4bbb-8ccc-dddddddddddd";

function authedUser(over: Partial<{ org_id: string; base_role: string }> = {}) {
  return {
    user: { id: USER },
    profile: { base_role: over.base_role ?? "org_admin" },
    org_id: over.org_id ?? ORG,
  } as never;
}

function makePermSet(items: string[] = []): Set<string> {
  return new Set(items);
}

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/views", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/views — auth + org checks", () => {
  it("returns 401 when no user session", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const res = await POST(
      makeRequest({ intent: "create", entity_type: "lead" }),
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: "auth" });
  });

  it("returns 400 when user has no org_id", async () => {
    mocks.getCurrentUser.mockResolvedValue(
      authedUser({ org_id: undefined as unknown as string }),
    );
    const res = await POST(
      makeRequest({ intent: "create", entity_type: "lead" }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe("validation");
  });

  it("returns 400 when body is not JSON", async () => {
    mocks.getCurrentUser.mockResolvedValue(authedUser());
    mocks.resolveForUser.mockReturnValue(makePermSet(["views:customize"]));
    const req = new NextRequest("http://localhost:3000/api/views", {
      method: "POST",
      body: "not-json-{",
      headers: { "content-type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});

describe("POST /api/views — intent: create", () => {
  it("rejects org-scope create without views:customize permission (403)", async () => {
    mocks.getCurrentUser.mockResolvedValue(authedUser());
    mocks.resolveForUser.mockReturnValue(makePermSet([])); // no perms
    const res = await POST(
      makeRequest({
        intent: "create",
        entity_type: "lead",
        scope: "org",
        name: "Org view",
        slug: "org-view",
      }),
    );
    expect(res.status).toBe(403);
  });

  it("accepts user-scope create from any authenticated user", async () => {
    mocks.getCurrentUser.mockResolvedValue(authedUser());
    mocks.resolveForUser.mockReturnValue(makePermSet([])); // no perms
    mocks.createView.mockResolvedValue({ id: VIEW_ID });
    const res = await POST(
      makeRequest({
        intent: "create",
        entity_type: "lead",
        scope: "user",
        name: "My view",
        slug: "my-view",
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, data: { id: VIEW_ID } });
    expect(mocks.createView).toHaveBeenCalledOnce();
  });

  it("returns 400 with field errors when payload fails zod", async () => {
    mocks.getCurrentUser.mockResolvedValue(authedUser());
    mocks.resolveForUser.mockReturnValue(makePermSet(["views:customize"]));
    const res = await POST(
      makeRequest({
        intent: "create",
        entity_type: "lead",
        scope: "user",
        name: "", // invalid — min length 1
        slug: "BadSlugUppercase", // invalid — must be lowercase
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe("validation");
    expect(body.fieldErrors).toBeDefined();
  });
});

describe("POST /api/views — intent: update / delete / set_default", () => {
  it("dispatches update", async () => {
    mocks.getCurrentUser.mockResolvedValue(authedUser());
    mocks.resolveForUser.mockReturnValue(makePermSet(["views:customize"]));
    mocks.updateView.mockResolvedValue({ id: VIEW_ID });
    const res = await POST(
      makeRequest({ intent: "update", id: VIEW_ID, name: "Renamed" }),
    );
    expect(res.status).toBe(200);
    expect(mocks.updateView).toHaveBeenCalledOnce();
  });

  it("dispatches delete", async () => {
    mocks.getCurrentUser.mockResolvedValue(authedUser());
    mocks.resolveForUser.mockReturnValue(makePermSet(["views:customize"]));
    mocks.deleteView.mockResolvedValue({ id: VIEW_ID });
    const res = await POST(makeRequest({ intent: "delete", id: VIEW_ID }));
    expect(res.status).toBe(200);
    expect(mocks.deleteView).toHaveBeenCalledOnce();
  });

  it("dispatches set_default", async () => {
    mocks.getCurrentUser.mockResolvedValue(authedUser());
    mocks.resolveForUser.mockReturnValue(makePermSet(["views:customize"]));
    mocks.setDefaultView.mockResolvedValue({ view_id: VIEW_ID });
    const res = await POST(
      makeRequest({ intent: "set_default", view_id: VIEW_ID }),
    );
    expect(res.status).toBe(200);
    expect(mocks.setDefaultView).toHaveBeenCalledOnce();
  });

  it("returns 400 for an unknown intent", async () => {
    mocks.getCurrentUser.mockResolvedValue(authedUser());
    mocks.resolveForUser.mockReturnValue(makePermSet(["views:customize"]));
    const res = await POST(makeRequest({ intent: "lol" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toContain("Unknown intent");
  });
});
