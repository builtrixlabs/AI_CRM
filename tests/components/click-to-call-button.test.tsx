// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ClickToCallButton } from "@/components/canvas/click-to-call-button";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
}));

const fetchMock = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = fetchMock as unknown as typeof fetch;
});

describe("<ClickToCallButton>", () => {
  it("prompts to set a phone number when the rep has none", () => {
    render(
      <ClickToCallButton leadId="lead-1" leadHasPhone repPhone={null} />,
    );
    expect(screen.getByTestId("click-to-call-no-phone")).toBeDefined();
    expect(screen.queryByTestId("click-to-call-btn")).toBeNull();
  });

  it("renders an enabled Call button when the rep + lead both have phones", () => {
    render(
      <ClickToCallButton
        leadId="lead-1"
        leadHasPhone
        repPhone="+919812345678"
      />,
    );
    const btn = screen.getByTestId("click-to-call-btn") as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });

  it("disables the Call button when the lead has no phone", () => {
    render(
      <ClickToCallButton
        leadId="lead-1"
        leadHasPhone={false}
        repPhone="+919812345678"
      />,
    );
    const btn = screen.getByTestId("click-to-call-btn") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(screen.getByText(/no phone number on this lead/i)).toBeDefined();
  });

  it("POSTs to /api/calls/initiate and shows the calling message on success", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, provider_call_id: "exo-1" }),
    });
    render(
      <ClickToCallButton
        leadId="lead-1"
        leadHasPhone
        repPhone="+919812345678"
      />,
    );
    fireEvent.click(screen.getByTestId("click-to-call-btn"));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/calls/initiate",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    await waitFor(() =>
      expect(
        screen.getByTestId("click-to-call-message").textContent,
      ).toMatch(/both phones will ring/i),
    );
  });

  it("surfaces a friendly error when the org has no telephony adapter", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ error: "not_configured" }),
    });
    render(
      <ClickToCallButton
        leadId="lead-1"
        leadHasPhone
        repPhone="+919812345678"
      />,
    );
    fireEvent.click(screen.getByTestId("click-to-call-btn"));
    await waitFor(() => {
      const msg = screen.getByTestId("click-to-call-message");
      expect(msg.textContent).toMatch(/telephony integration isn't configured/i);
      expect(msg.getAttribute("role")).toBe("alert");
    });
  });
});
