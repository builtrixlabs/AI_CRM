// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { IntegrationFailureBanner } from "@/components/admin/integration-failure-banner";

describe("IntegrationFailureBanner", () => {
  it("renders nothing when count is 0", () => {
    const { container } = render(
      <IntegrationFailureBanner channel="email" count={0} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when count is negative", () => {
    const { container } = render(
      <IntegrationFailureBanner channel="email" count={-5} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("shows the formatted count and pluralised noun for email", () => {
    render(<IntegrationFailureBanner channel="email" count={42} />);
    expect(screen.getByText(/Email reminders are not being delivered/i)).toBeInTheDocument();
    expect(screen.getByText(/42 reminders could not be queued/)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Configure email/i }),
    ).toHaveAttribute("href", "/admin/integrations/email");
  });

  it("uses singular wording when count is 1", () => {
    render(<IntegrationFailureBanner channel="telephony" count={1} />);
    expect(screen.getByText(/1 callback could not be queued/)).toBeInTheDocument();
  });

  it("renders the WhatsApp variant copy", () => {
    render(<IntegrationFailureBanner channel="whatsapp" count={3} />);
    expect(screen.getByText(/WhatsApp follow-ups are not being delivered/i)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Configure WhatsApp/i }),
    ).toHaveAttribute("href", "/admin/integrations/whatsapp");
  });

  it("honours a custom configureHref override", () => {
    render(
      <IntegrationFailureBanner
        channel="sms"
        count={2}
        configureHref="/admin/integrations/sms?utm=banner"
      />,
    );
    expect(
      screen.getByRole("link", { name: /Configure SMS/i }),
    ).toHaveAttribute("href", "/admin/integrations/sms?utm=banner");
  });
});
