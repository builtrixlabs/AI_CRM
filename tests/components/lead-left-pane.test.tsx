// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// ClickToCallButton uses next/navigation; stub useRouter to avoid the
// "called outside of a Router" error in jsdom.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { LeadLeftPane } from "@/app/(dashboard)/dashboard/leads/[id]/left-pane/lead-left-pane";
import type { CanvasLead } from "@/lib/canvas/types";

function lead(over: Partial<CanvasLead> = {}): CanvasLead {
  return {
    id: "lead-1",
    organization_id: "org-1",
    workspace_id: "ws-1",
    label: "Mr. Badri Ramesh",
    state: "contacted",
    data: {
      phone: "+918072439670",
      email: "badri@example.com",
      source: "other",
    } as never,
    created_at: "2026-05-15T10:00:00.000Z",
    updated_at: "2026-05-15T10:00:00.000Z",
    ...over,
  };
}

describe("<LeadLeftPane>", () => {
  it("renders status + name + phone + email rows", () => {
    render(<LeadLeftPane lead={lead()} canCall={true} repPhone="+919900000000" />);
    expect(screen.getByTestId("left-pane-status").textContent).toMatch(
      /contacted/i,
    );
    expect(screen.getByTestId("left-pane-name").textContent).toBe(
      "Mr. Badri Ramesh",
    );
    expect(screen.getByTestId("left-pane-phone").textContent).toBe(
      "+918072439670",
    );
    expect(screen.getByTestId("left-pane-email").textContent).toBe(
      "badri@example.com",
    );
  });

  it("renders WhatsApp deep link from the lead phone", () => {
    render(<LeadLeftPane lead={lead()} canCall={false} repPhone={null} />);
    const wa = screen.getByTestId("left-pane-whatsapp") as HTMLAnchorElement;
    expect(wa.href).toContain("wa.me/+918072439670");
    expect(wa.target).toBe("_blank");
  });

  it("renders the Voice IQ block when lead.data.voice_iq is present", () => {
    const l = lead({
      data: {
        phone: "+91",
        source: "other",
        voice_iq: {
          intent_score: 82,
          budget: true,
          authority: true,
          need: true,
          timeline: "3 months",
          next_best_action: "Send brochure",
        },
      } as never,
    });
    render(<LeadLeftPane lead={l} canCall={false} repPhone={null} />);
    expect(screen.getByTestId("left-pane-voice-iq")).toBeDefined();
    expect(screen.getByTestId("left-pane-voice-iq-intent").textContent).toBe(
      "82",
    );
    expect(screen.getByTestId("left-pane-voice-iq-nba").textContent).toMatch(
      /Send brochure/,
    );
  });

  it("omits the Voice IQ block when not present", () => {
    render(<LeadLeftPane lead={lead()} canCall={false} repPhone={null} />);
    expect(screen.queryByTestId("left-pane-voice-iq")).toBeNull();
  });

  it("renders the click-to-call control only when canCall=true", () => {
    const { rerender } = render(
      <LeadLeftPane lead={lead()} canCall={false} repPhone="+919900000000" />,
    );
    expect(screen.queryByTestId("click-to-call")).toBeNull();
    rerender(
      <LeadLeftPane lead={lead()} canCall={true} repPhone="+919900000000" />,
    );
    expect(screen.getByTestId("click-to-call")).toBeDefined();
  });

  it("omits phone-dependent surfaces when the lead has no phone", () => {
    const l = lead({ data: { source: "other" } as never });
    render(<LeadLeftPane lead={l} canCall={true} repPhone="+919900000000" />);
    expect(screen.queryByTestId("left-pane-phone")).toBeNull();
    expect(screen.queryByTestId("left-pane-whatsapp")).toBeNull();
  });
});
