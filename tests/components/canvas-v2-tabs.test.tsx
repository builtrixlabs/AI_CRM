// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { UpdatesTab } from "@/app/(dashboard)/dashboard/leads/[id]/tabs/updates-tab";
import { ChatsTab } from "@/app/(dashboard)/dashboard/leads/[id]/tabs/chats-tab";
import { CallsTab } from "@/app/(dashboard)/dashboard/leads/[id]/tabs/calls-tab";
import { EmailsTab } from "@/app/(dashboard)/dashboard/leads/[id]/tabs/emails-tab";
import { AppointmentsTab } from "@/app/(dashboard)/dashboard/leads/[id]/tabs/appointments-tab";
import { DocumentsTab } from "@/app/(dashboard)/dashboard/leads/[id]/tabs/documents-tab";
import type {
  CanvasActivity,
  CanvasAppointment,
  CanvasDocument,
} from "@/lib/canvas/types";

function activity(over: Partial<CanvasActivity> = {}): CanvasActivity {
  return {
    id: "a-1",
    organization_id: "org-1",
    workspace_id: "ws-1",
    label: "Sample activity",
    data: {},
    created_at: "2026-05-15T10:00:00.000Z",
    created_by: "u-1",
    created_via: "manual",
    ai_confidence: null,
    agent_tier: null,
    ...over,
  };
}

describe("<UpdatesTab>", () => {
  it("renders empty state when no activities", () => {
    render(<UpdatesTab activities={[]} />);
    expect(screen.getByTestId("updates-tab-empty")).toBeDefined();
  });
  it("renders one row per activity", () => {
    render(
      <UpdatesTab
        activities={[
          activity({ id: "a-A", label: "Call placed" }),
          activity({ id: "a-B", label: "Email sent" }),
        ]}
      />,
    );
    expect(screen.getByTestId("updates-row-a-A")).toBeDefined();
    expect(screen.getByTestId("updates-row-a-B")).toBeDefined();
  });
  it("marks AI-tier activities with the agent badge", () => {
    render(
      <UpdatesTab
        activities={[
          activity({ id: "a-AI", agent_tier: "T2", label: "Brochure sent" }),
        ]}
      />,
    );
    const row = screen.getByTestId("updates-row-a-AI");
    expect(row.getAttribute("data-actor")).toBe("agent");
    expect(row.textContent).toMatch(/AI · T2/);
  });
});

describe("<ChatsTab>", () => {
  it("filters to whatsapp + sms comms_sent rows", () => {
    render(
      <ChatsTab
        activities={[
          activity({
            id: "c-W",
            data: { kind: "comms_sent", channel: "whatsapp" },
            label: "WA sent",
          }),
          activity({
            id: "c-S",
            data: { kind: "comms_sent", channel: "sms" },
            label: "SMS sent",
          }),
          activity({
            id: "c-E",
            data: { kind: "comms_sent", channel: "email" },
            label: "Email sent",
          }),
          activity({
            id: "c-Call",
            data: { kind: "call_completed" },
            label: "Call ended",
          }),
        ]}
      />,
    );
    expect(screen.getByTestId("chat-row-c-W")).toBeDefined();
    expect(screen.getByTestId("chat-row-c-S")).toBeDefined();
    expect(screen.queryByTestId("chat-row-c-E")).toBeNull();
    expect(screen.queryByTestId("chat-row-c-Call")).toBeNull();
  });

  it("empty state when no chat rows", () => {
    render(<ChatsTab activities={[]} />);
    expect(screen.getByTestId("chats-tab-empty")).toBeDefined();
  });
});

describe("<CallsTab>", () => {
  it("filters to call_initiated + call_completed", () => {
    render(
      <CallsTab
        activities={[
          activity({ id: "k-1", data: { kind: "call_initiated" } }),
          activity({
            id: "k-2",
            data: { kind: "call_completed", duration_seconds: 125 },
          }),
          activity({
            id: "k-3",
            data: { kind: "comms_sent", channel: "whatsapp" },
          }),
        ]}
      />,
    );
    expect(screen.getByTestId("call-row-k-1")).toBeDefined();
    expect(screen.getByTestId("call-row-k-2")).toBeDefined();
    expect(screen.queryByTestId("call-row-k-3")).toBeNull();
    // Duration shown when present.
    expect(
      screen.getByTestId("call-row-k-2-duration").textContent,
    ).toMatch(/2m 5s/);
  });
});

describe("<EmailsTab>", () => {
  it("filters to comms_sent email rows", () => {
    render(
      <EmailsTab
        activities={[
          activity({
            id: "e-1",
            data: { kind: "comms_sent", channel: "email" },
          }),
          activity({
            id: "e-2",
            data: { kind: "comms_sent", channel: "whatsapp" },
          }),
        ]}
      />,
    );
    expect(screen.getByTestId("email-row-e-1")).toBeDefined();
    expect(screen.queryByTestId("email-row-e-2")).toBeNull();
  });
});

describe("<AppointmentsTab>", () => {
  function appt(over: Partial<CanvasAppointment> = {}): CanvasAppointment {
    return {
      id: "v-1",
      label: "Site visit · Skyline Phase 2",
      state: "scheduled",
      scheduled_at: "2026-05-20T11:30:00.000Z",
      pickup_address: null,
      cab_provider: null,
      assigned_sales_rep_id: null,
      created_at: "2026-05-15T10:00:00.000Z",
      ...over,
    };
  }
  it("renders empty state when no appointments", () => {
    render(<AppointmentsTab appointments={[]} />);
    expect(screen.getByTestId("appointments-tab-empty")).toBeDefined();
  });
  it("renders one row per appointment + state pill", () => {
    render(
      <AppointmentsTab
        appointments={[appt(), appt({ id: "v-2", state: "completed" })]}
      />,
    );
    expect(screen.getByTestId("appointment-row-v-1")).toBeDefined();
    expect(
      screen.getByTestId("appointment-row-v-1-state").textContent,
    ).toMatch(/scheduled/i);
    expect(
      screen.getByTestId("appointment-row-v-2-state").textContent,
    ).toMatch(/completed/i);
  });
});

describe("<DocumentsTab>", () => {
  function doc(over: Partial<CanvasDocument> = {}): CanvasDocument {
    return {
      id: "d-1",
      label: "Skyline Phase 2 — 3BHK Floor Plan.pdf",
      document_type: "floor_plan",
      storage_url: "https://example.com/file.pdf",
      created_at: "2026-05-15T10:00:00.000Z",
      created_by: "u-1",
      ...over,
    };
  }
  it("renders empty state when no documents", () => {
    render(<DocumentsTab documents={[]} />);
    expect(screen.getByTestId("documents-tab-empty")).toBeDefined();
  });
  it("renders one row per document + open link when storage_url present", () => {
    render(<DocumentsTab documents={[doc()]} />);
    const row = screen.getByTestId("document-row-d-1");
    expect(row.textContent).toContain("Skyline Phase 2");
    const openLink = screen.getByTestId(
      "document-row-d-1-open",
    ) as HTMLAnchorElement;
    expect(openLink.href).toBe("https://example.com/file.pdf");
    expect(openLink.target).toBe("_blank");
  });
  it("omits the open link when storage_url is null", () => {
    render(<DocumentsTab documents={[doc({ storage_url: null })]} />);
    expect(screen.queryByTestId("document-row-d-1-open")).toBeNull();
  });
});

// CommentsTab needs the add-comment action mocked because it imports it
// at module level. Test it in a separate file (comments-tab.test.tsx).
describe.skip("<CommentsTab> — tested separately", () => {
  it("placeholder", () => undefined);
});

// Suppress unused mock to keep TS happy if vi.* added later.
void vi;
