// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { OnboardingBanner } from "@/components/admin/onboarding-banner";

describe("OnboardingBanner", () => {
  it("renders nothing when onboarding is complete", () => {
    const { container } = render(
      <OnboardingBanner completed={true} currentStep="completed" />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when currentStep is the 'completed' sentinel", () => {
    const { container } = render(
      <OnboardingBanner completed={false} currentStep="completed" />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("shows the current step humanised and the resume CTA", () => {
    render(
      <OnboardingBanner completed={false} currentStep="lead_sources" />,
    );
    expect(screen.getByText(/Finish setting up your organization/i)).toBeInTheDocument();
    expect(screen.getByText("Lead Sources")).toBeInTheDocument();
    expect(screen.getByText(/Resume setup/i)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /Resume setup/i });
    expect(link).toHaveAttribute("href", "/admin/onboarding");
  });

  it("computes a sensible progress percentage from STEP_IDS index", () => {
    // org_details is index 0 → progress 0%; (Step 1 of 8 — 0%)
    render(<OnboardingBanner completed={false} currentStep="org_details" />);
    expect(screen.getByText(/Step 1 of 8/)).toBeInTheDocument();
    expect(screen.getByText(/\(0%\)/)).toBeInTheDocument();
  });

  it("late steps render the higher percentage", () => {
    // sample_demo is index 7 (last step) → 7/8 = 88%
    render(<OnboardingBanner completed={false} currentStep="sample_demo" />);
    expect(screen.getByText(/Step 8 of 8/)).toBeInTheDocument();
    expect(screen.getByText(/\(88%\)/)).toBeInTheDocument();
  });

  it("honours a custom resumeHref override", () => {
    render(
      <OnboardingBanner
        completed={false}
        currentStep="branding"
        resumeHref="/admin/onboarding?step=branding"
      />,
    );
    const link = screen.getByRole("link", { name: /Resume setup/i });
    expect(link).toHaveAttribute("href", "/admin/onboarding?step=branding");
  });
});
