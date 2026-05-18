// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import { SendEmailButton } from "@/components/canvas/send-email-button";
import {
  SendWhatsAppButton,
  parseVariables,
} from "@/components/canvas/send-whatsapp-button";

const LEAD = "lead-1";

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("SendEmailButton", () => {
  it("is disabled when the lead has no email", () => {
    render(<SendEmailButton leadId={LEAD} leadEmail={null} />);
    const btn = screen.getByTestId("send-email-btn") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("opens a dialog with subject + body fields when clicked", () => {
    render(<SendEmailButton leadId={LEAD} leadEmail="a@b.com" />);
    fireEvent.click(screen.getByTestId("send-email-btn"));
    expect(screen.getByTestId("send-email-subject")).toBeTruthy();
    expect(screen.getByTestId("send-email-body")).toBeTruthy();
  });

  it("POSTs the subject + body to /api/leads/:id/send-email and shows success", async () => {
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true, activity_id: "act-1" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    render(<SendEmailButton leadId={LEAD} leadEmail="a@b.com" />);
    fireEvent.click(screen.getByTestId("send-email-btn"));
    fireEvent.change(screen.getByTestId("send-email-subject"), {
      target: { value: "Hello" },
    });
    fireEvent.change(screen.getByTestId("send-email-body"), {
      target: { value: "Body text" },
    });
    fireEvent.click(screen.getByTestId("send-email-submit"));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/leads/${encodeURIComponent(LEAD)}/send-email`,
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ subject: "Hello", body_text: "Body text" }),
        }),
      );
    });
    await waitFor(() => {
      expect(screen.getByTestId("send-email-message").textContent).toMatch(
        /Email sent/i,
      );
    });
  });

  it("surfaces server error messages on non-2xx responses", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "not_configured" }), {
        status: 409,
        headers: { "Content-Type": "application/json" },
      }),
    );
    render(<SendEmailButton leadId={LEAD} leadEmail="a@b.com" />);
    fireEvent.click(screen.getByTestId("send-email-btn"));
    fireEvent.change(screen.getByTestId("send-email-subject"), {
      target: { value: "Hi" },
    });
    fireEvent.change(screen.getByTestId("send-email-body"), {
      target: { value: "Body" },
    });
    fireEvent.click(screen.getByTestId("send-email-submit"));
    await waitFor(() => {
      const msg = screen.getByTestId("send-email-message");
      expect(msg.textContent).toMatch(/Email isn.t configured/);
      expect(msg.getAttribute("role")).toBe("alert");
    });
  });
});

describe("SendWhatsAppButton", () => {
  it("is disabled when the lead has no phone", () => {
    render(<SendWhatsAppButton leadId={LEAD} leadPhone={null} />);
    const btn = screen.getByTestId("send-whatsapp-btn") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("fetches templates on open and renders the picker", async () => {
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ templates: ["follow_up_default", "site_visit_confirm"] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    render(<SendWhatsAppButton leadId={LEAD} leadPhone="+919999900000" />);
    fireEvent.click(screen.getByTestId("send-whatsapp-btn"));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/leads/${encodeURIComponent(LEAD)}/whatsapp-templates`,
        expect.objectContaining({
          headers: expect.objectContaining({ Accept: "application/json" }),
        }),
      );
    });
    await waitFor(() => {
      expect(
        screen.getByTestId("send-whatsapp-template-trigger"),
      ).toBeTruthy();
    });
  });

  it("shows a no-templates hint when the org has none approved", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ templates: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    render(<SendWhatsAppButton leadId={LEAD} leadPhone="+919999900000" />);
    fireEvent.click(screen.getByTestId("send-whatsapp-btn"));
    await waitFor(() => {
      expect(screen.getByTestId("send-whatsapp-no-templates")).toBeTruthy();
    });
    // Submit should remain disabled.
    expect(
      (screen.getByTestId("send-whatsapp-submit") as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});

describe("parseVariables", () => {
  it("parses key=value pairs", () => {
    expect(parseVariables("var1=Aanya,var2=Casagrand")).toEqual({
      var1: "Aanya",
      var2: "Casagrand",
    });
  });

  it("trims whitespace + tolerates blank pairs", () => {
    expect(parseVariables(" var1 = Aanya , , var2= ECR ")).toEqual({
      var1: "Aanya",
      var2: "ECR",
    });
  });

  it("preserves '=' inside values", () => {
    expect(parseVariables("link=https://x.com/?a=b")).toEqual({
      link: "https://x.com/?a=b",
    });
  });

  it("returns {} for empty / no-equals input", () => {
    expect(parseVariables("")).toEqual({});
    expect(parseVariables("just,some,words")).toEqual({});
  });
});
