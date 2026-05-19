// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/dashboard/leads/lead-1",
}));

// ActivityStream subscribes to Supabase realtime — mock the client-side
// hook so this test stays unit-scoped.
vi.mock("@/components/canvas/realtime", () => ({
  useLeadActivityStream: (args: { initial: unknown[] }) => args.initial,
}));

// Server actions transitively import the service-role admin client; mock
// them so the workspace can mount in jsdom without tripping the
// "must never be imported from client" guard in src/lib/supabase/admin.ts.
vi.mock("@/app/(dashboard)/dashboard/_actions/leads", () => ({
  createLeadAction: vi.fn(),
  updateLeadAction: vi.fn(),
  transitionLeadAction: vi.fn(),
  promoteLeadToDealAction: vi.fn(),
}));

import { LeadWorkspace } from "@/components/canvas/lead-workspace";
import type { CanvasLead } from "@/lib/canvas/types";

const LEAD: CanvasLead = {
  id: "lead-1",
  organization_id: "org-a",
  workspace_id: "ws-a",
  label: "Aanya Sharma",
  state: "qualified",
  data: {
    name: "Aanya Sharma",
    phone: "+91 9000010001",
    email: "aanya@example.com",
    source: "MagicBricks",
    intent_score: 88,
  } as never,
  created_at: "2026-05-15T10:00:00.000Z",
  updated_at: "2026-05-17T10:00:00.000Z",
};

describe("LeadWorkspace", () => {
  it("renders the profile rail and the 4 main panels for a valid lead", () => {
    render(
      <LeadWorkspace
        lead={LEAD}
        initialActivities={[]}
        canEdit
        canTransition
        canCall
        canPromoteToDeal
        canScheduleVisit
        repPhone="+91 9000099999"
        ownerName="Priya Iyer"
        ownerRole="Sales Rep"
      />,
    );
    expect(screen.getByTestId("lead-profile-rail")).toBeTruthy();
    expect(screen.getByTestId("lead-activity-section")).toBeTruthy();
    expect(screen.getByTestId("lead-suggested-section")).toBeTruthy();
    expect(screen.getByTestId("lead-agent-section")).toBeTruthy();
    expect(screen.getByTestId("lead-transition-section")).toBeTruthy();
  });

  it("hides perm-gated actions when caller lacks the permission", () => {
    render(
      <LeadWorkspace
        lead={LEAD}
        initialActivities={[]}
        canEdit={false}
        canTransition={false}
        canCall={false}
        canPromoteToDeal={false}
        canScheduleVisit={false}
      />,
    );
    expect(screen.queryByTestId("schedule-visit-btn")).toBeNull();
    expect(screen.queryByTestId("lead-call-card")).toBeNull();
    expect(screen.queryByTestId("lead-transition-section")).toBeNull();
    expect(screen.queryByTestId("edit-mode-toggle")).toBeNull();
  });

  it("renders the demo banner and suppresses interactive actions in demo mode", () => {
    render(
      <LeadWorkspace
        lead={LEAD}
        initialActivities={[]}
        demo
        canEdit
        canPromoteToDeal
        canScheduleVisit
        canCall
        canTransition
      />,
    );
    expect(screen.getByTestId("demo-banner")).toBeTruthy();
    expect(screen.queryByTestId("edit-mode-toggle")).toBeNull();
    expect(screen.queryByTestId("schedule-visit-btn")).toBeNull();
    expect(screen.queryByTestId("lead-transition-section")).toBeNull();
  });

  it("renders an actions bar even when a single action is enabled", () => {
    render(
      <LeadWorkspace
        lead={LEAD}
        initialActivities={[]}
        canScheduleVisit
      />,
    );
    expect(screen.getByTestId("lead-actions-bar")).toBeTruthy();
    expect(screen.getByTestId("schedule-visit-btn")).toBeTruthy();
  });
});
