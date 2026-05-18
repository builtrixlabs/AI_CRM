// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  LeadProfileRail,
  __testing,
} from "@/components/canvas/lead-profile-rail";
import type { CanvasLead } from "@/lib/canvas/types";

const BASE: CanvasLead = {
  id: "lead-123",
  organization_id: "org-a",
  workspace_id: "ws-a",
  label: "lead-123",
  state: "new",
  data: {} as never,
  created_at: "2026-05-15T10:00:00.000Z",
  updated_at: "2026-05-17T10:00:00.000Z",
};

describe("LeadProfileRail", () => {
  it("renders identity, contact, source, and ownership for a fully-populated lead", () => {
    render(
      <LeadProfileRail
        lead={{
          ...BASE,
          label: "Aanya Sharma",
          state: "qualified",
          data: {
            name: "Aanya Sharma",
            phone: "+91 9000010001",
            email: "aanya@example.com",
            source: "MagicBricks",
            intent_score: 88,
            project: "Casagrand ECR",
          } as never,
        }}
        ownerName="Priya Iyer"
        ownerRole="Sales Rep"
      />,
    );
    expect(screen.getByTestId("lead-profile-name").textContent).toBe(
      "Aanya Sharma",
    );
    expect(screen.getByTestId("lead-stage-badge").textContent).toBe("Qualified");
    expect(screen.getByTestId("lead-intent-chip").textContent).toBe("Intent 88");
    expect(screen.getByText("MagicBricks")).toBeTruthy();
    expect(screen.getByText("Casagrand ECR")).toBeTruthy();
    expect(screen.getByText("Priya Iyer")).toBeTruthy();
    expect(screen.getByText("Sales Rep")).toBeTruthy();
    // tel:/mailto: links wired
    const tel = screen.getByTestId("rail-phone-link") as HTMLAnchorElement;
    expect(tel.getAttribute("href")).toBe("tel:+91 9000010001");
    const mail = screen.getByTestId("rail-email-link") as HTMLAnchorElement;
    expect(mail.getAttribute("href")).toBe("mailto:aanya@example.com");
  });

  it("gracefully renders empty states for sparse leads (UUID label, no fields)", () => {
    render(<LeadProfileRail lead={BASE} />);
    // Name falls back to truncated ID
    expect(screen.getByTestId("lead-profile-name").textContent).toMatch(
      /lead-123/,
    );
    expect(screen.queryByTestId("lead-intent-chip")).toBeNull();
    // Phone + Email both empty → 2× "Not captured" hints
    expect(screen.getAllByText("Not captured").length).toBe(2);
    expect(screen.getByText("Unknown")).toBeTruthy(); // source empty
    expect(screen.getByText("No project linked")).toBeTruthy();
    expect(screen.getByText("Unassigned")).toBeTruthy();
  });

  it("formats stage labels (snake_case → Title Case)", () => {
    render(
      <LeadProfileRail
        lead={{ ...BASE, state: "on_hold", data: {} as never }}
      />,
    );
    expect(screen.getByTestId("lead-stage-badge").textContent).toBe("On Hold");
  });

  it("intent tone tiering — ≥70 copper, 40-69 amethyst, <40 slate", () => {
    expect(__testing.intentTone(85)[1]).toBe("var(--copper-800)");
    expect(__testing.intentTone(50)[1]).toBe("var(--amethyst-800)");
    expect(__testing.intentTone(30)[1]).toBe("var(--slate-700)");
  });

  it("prettyId truncates long UUIDs", () => {
    expect(__testing.prettyId("F853349A-44C1-495A-9E58-DA01B2C3D4E5")).toBe(
      "F853349A…D4E5",
    );
    expect(__testing.prettyId("short")).toBe("short");
  });

  it("deriveInitials uses first 2 chars for hex-like IDs, name initials otherwise", () => {
    expect(__testing.deriveInitials("F853349A-44C1")).toBe("F8");
    expect(__testing.deriveInitials("Aanya Sharma")).toBe("AS");
    expect(__testing.deriveInitials("Madonna")).toBe("MA");
  });
});
