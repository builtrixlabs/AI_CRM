import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  resolveForUser: vi.fn(),
  sendEmailFromLead: vi.fn(),
  sendWhatsAppFromLead: vi.fn(),
  listApprovedWhatsAppTemplates: vi.fn(),
}));
vi.mock("@/lib/auth/getCurrentUser", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));
vi.mock("@/lib/auth/permissions", () => ({
  resolveForUser: mocks.resolveForUser,
}));
vi.mock("@/lib/comms/email/send-from-lead", () => ({
  sendEmailFromLead: mocks.sendEmailFromLead,
}));
vi.mock("@/lib/comms/whatsapp/send-from-lead", () => ({
  sendWhatsAppFromLead: mocks.sendWhatsAppFromLead,
  listApprovedWhatsAppTemplates: mocks.listApprovedWhatsAppTemplates,
}));

import { POST as sendEmail } from "@/app/api/leads/[id]/send-email/route";
import { POST as sendWhatsApp } from "@/app/api/leads/[id]/send-whatsapp/route";
import { GET as listTemplates } from "@/app/api/leads/[id]/whatsapp-templates/route";

const LEAD = "22222222-3333-4444-8555-666666666666";
const ORG = "11111111-2222-4333-8444-555555555555";
const USER = "bbbbbbbb-3333-4444-8555-666666666666";

function authedUser(perms: string[]) {
  return {
    user: { id: USER, email: "rep@example.com" },
    profile: {
      id: USER,
      display_name: "Test Rep",
      base_role: "sales_rep" as const,
      phone: "+919812345678",
    },
    org_id: ORG,
    workspace_ids: [],
    app_roles: [],
  };
}

function jsonReq(body: unknown): Request {
  return new Request(`http://test.local/api/leads/${LEAD}/send-email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
});

describe("POST /api/leads/[id]/send-email", () => {
  it("401 when unauthenticated", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const res = await sendEmail(jsonReq({ subject: "x", body_text: "y" }), {
      params: Promise.resolve({ id: LEAD }),
    });
    expect(res.status).toBe(401);
  });

  it("403 when caller lacks activities:create", async () => {
    mocks.getCurrentUser.mockResolvedValue(authedUser([]));
    mocks.resolveForUser.mockReturnValue(new Set(["leads:view"]));
    const res = await sendEmail(jsonReq({ subject: "x", body_text: "y" }), {
      params: Promise.resolve({ id: LEAD }),
    });
    expect(res.status).toBe(403);
  });

  it("400 on bad JSON", async () => {
    mocks.getCurrentUser.mockResolvedValue(authedUser([]));
    mocks.resolveForUser.mockReturnValue(new Set(["activities:create"]));
    const bad = new Request("http://test.local/x", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });
    const res = await sendEmail(bad, { params: Promise.resolve({ id: LEAD }) });
    expect(res.status).toBe(400);
  });

  it("delegates to sendEmailFromLead and returns 200 on success", async () => {
    mocks.getCurrentUser.mockResolvedValue(authedUser([]));
    mocks.resolveForUser.mockReturnValue(new Set(["activities:create"]));
    mocks.sendEmailFromLead.mockResolvedValue({
      ok: true,
      provider_message_id: "pm-1",
      thread_id: "th-1",
      activity_id: "act-1",
      provider: "mock",
    });
    const res = await sendEmail(
      jsonReq({ subject: "Hi", body_text: "Body" }),
      { params: Promise.resolve({ id: LEAD }) },
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.activity_id).toBe("act-1");
    expect(mocks.sendEmailFromLead).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: ORG,
        lead_id: LEAD,
        from_user_id: USER,
        subject: "Hi",
        body_text: "Body",
      }),
    );
  });

  it("maps reasons to HTTP statuses (lead_not_found→404, missing_*→422, not_configured→409)", async () => {
    mocks.getCurrentUser.mockResolvedValue(authedUser([]));
    mocks.resolveForUser.mockReturnValue(new Set(["activities:create"]));
    const cases: Array<[string, number]> = [
      ["lead_not_found", 404],
      ["no_lead_email", 422],
      ["missing_subject", 422],
      ["missing_body", 422],
      ["not_configured", 409],
      ["provider_error", 502],
    ];
    for (const [reason, expectedStatus] of cases) {
      mocks.sendEmailFromLead.mockResolvedValueOnce({
        ok: false,
        reason,
      });
      const res = await sendEmail(
        jsonReq({ subject: "x", body_text: "y" }),
        { params: Promise.resolve({ id: LEAD }) },
      );
      expect(res.status).toBe(expectedStatus);
    }
  });
});

describe("POST /api/leads/[id]/send-whatsapp", () => {
  it("401 when unauthenticated, 403 when missing activities:create", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    let res = await sendWhatsApp(
      jsonReq({ template_id: "t", variables: {} }),
      { params: Promise.resolve({ id: LEAD }) },
    );
    expect(res.status).toBe(401);

    mocks.getCurrentUser.mockResolvedValue(authedUser([]));
    mocks.resolveForUser.mockReturnValue(new Set(["leads:view"]));
    res = await sendWhatsApp(jsonReq({ template_id: "t", variables: {} }), {
      params: Promise.resolve({ id: LEAD }),
    });
    expect(res.status).toBe(403);
  });

  it("delegates to sendWhatsAppFromLead and returns 200 + provider_message_id on success", async () => {
    mocks.getCurrentUser.mockResolvedValue(authedUser([]));
    mocks.resolveForUser.mockReturnValue(new Set(["activities:create"]));
    mocks.sendWhatsAppFromLead.mockResolvedValue({
      ok: true,
      provider_message_id: "wa-1",
      template_id: "follow_up_default",
      activity_id: "act-2",
      provider: "mock",
    });
    const res = await sendWhatsApp(
      jsonReq({
        template_id: "follow_up_default",
        variables: { var1: "A" },
      }),
      { params: Promise.resolve({ id: LEAD }) },
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.template_id).toBe("follow_up_default");
    expect(mocks.sendWhatsAppFromLead).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: ORG,
        lead_id: LEAD,
        template_id: "follow_up_default",
        variables: { var1: "A" },
      }),
    );
  });

  it("rejects non-string variable values silently → empty map sent through", async () => {
    mocks.getCurrentUser.mockResolvedValue(authedUser([]));
    mocks.resolveForUser.mockReturnValue(new Set(["activities:create"]));
    mocks.sendWhatsAppFromLead.mockResolvedValue({
      ok: true,
      provider_message_id: "wa-2",
      template_id: "t",
      activity_id: "act-3",
      provider: "mock",
    });
    await sendWhatsApp(
      jsonReq({ template_id: "t", variables: { var1: 42 } }),
      { params: Promise.resolve({ id: LEAD }) },
    );
    expect(mocks.sendWhatsAppFromLead).toHaveBeenCalledWith(
      expect.objectContaining({ variables: {} }),
    );
  });
});

describe("GET /api/leads/[id]/whatsapp-templates", () => {
  it("returns templates from listApprovedWhatsAppTemplates", async () => {
    mocks.getCurrentUser.mockResolvedValue(authedUser([]));
    mocks.resolveForUser.mockReturnValue(new Set(["activities:view"]));
    mocks.listApprovedWhatsAppTemplates.mockResolvedValue([
      "follow_up_default",
      "site_visit_confirm",
    ]);
    const res = await listTemplates(
      new Request(`http://test.local/api/leads/${LEAD}/whatsapp-templates`),
      { params: Promise.resolve({ id: LEAD }) },
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.templates).toEqual([
      "follow_up_default",
      "site_visit_confirm",
    ]);
  });

  it("403 when caller lacks activities:view", async () => {
    mocks.getCurrentUser.mockResolvedValue(authedUser([]));
    mocks.resolveForUser.mockReturnValue(new Set());
    const res = await listTemplates(
      new Request(`http://test.local/api/leads/${LEAD}/whatsapp-templates`),
      { params: Promise.resolve({ id: LEAD }) },
    );
    expect(res.status).toBe(403);
  });
});
