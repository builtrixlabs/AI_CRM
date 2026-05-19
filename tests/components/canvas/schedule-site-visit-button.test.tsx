// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ScheduleSiteVisitButton } from "@/components/canvas/schedule-site-visit-button";

describe("ScheduleSiteVisitButton", () => {
  it("links to /dashboard/site-visits with the lead id pre-selected", () => {
    render(<ScheduleSiteVisitButton leadId="lead-abc" />);
    const link = screen.getByTestId("schedule-visit-btn") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe(
      "/dashboard/site-visits?lead=lead-abc",
    );
    expect(link.textContent).toMatch(/Schedule visit/);
  });

  it("encodes lead ids with special characters", () => {
    render(<ScheduleSiteVisitButton leadId="a b/c" />);
    const link = screen.getByTestId("schedule-visit-btn") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe(
      "/dashboard/site-visits?lead=a%20b%2Fc",
    );
  });

  it("renders a disabled button (not a link) when disabled=true", () => {
    render(<ScheduleSiteVisitButton leadId="lead-abc" disabled />);
    const btn = screen.getByTestId(
      "schedule-visit-btn-disabled",
    ) as HTMLButtonElement;
    expect(btn.tagName).toBe("BUTTON");
    expect(btn.disabled).toBe(true);
    expect(screen.queryByTestId("schedule-visit-btn")).toBeNull();
  });
});
