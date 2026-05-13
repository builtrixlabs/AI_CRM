// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { IntegrationHealthBadge } from "@/components/admin/integration-health-badge";

describe("IntegrationHealthBadge", () => {
  it("renders the Healthy label for healthy status", () => {
    render(<IntegrationHealthBadge status="healthy" />);
    expect(screen.getByText("Healthy")).toBeInTheDocument();
    expect(screen.getByTestId("integration-health-healthy")).toBeInTheDocument();
  });

  it("renders the Degraded label for warning status", () => {
    render(<IntegrationHealthBadge status="warning" />);
    expect(screen.getByText("Degraded")).toBeInTheDocument();
    expect(screen.getByTestId("integration-health-warning")).toBeInTheDocument();
  });

  it("renders the Not configured label for not_configured status", () => {
    render(<IntegrationHealthBadge status="not_configured" />);
    expect(screen.getByText("Not configured")).toBeInTheDocument();
    expect(
      screen.getByTestId("integration-health-not_configured"),
    ).toBeInTheDocument();
  });

  it("renders the Coming soon label for unavailable status", () => {
    render(<IntegrationHealthBadge status="unavailable" />);
    expect(screen.getByText("Coming soon")).toBeInTheDocument();
    expect(
      screen.getByTestId("integration-health-unavailable"),
    ).toBeInTheDocument();
  });

  it("surfaces the detail in the title attribute when provided", () => {
    render(
      <IntegrationHealthBadge
        status="warning"
        detail="401 — invalid api_key"
      />,
    );
    const badge = screen.getByTestId("integration-health-warning");
    expect(badge.getAttribute("title")).toBe(
      "Degraded — 401 — invalid api_key",
    );
  });

  it("uses the status label alone when no detail is supplied", () => {
    render(<IntegrationHealthBadge status="healthy" />);
    const badge = screen.getByTestId("integration-health-healthy");
    expect(badge.getAttribute("title")).toBe("Healthy");
  });
});
