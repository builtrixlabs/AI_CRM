// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SiteVisitBookingCard } from "@/components/agents/site-visit-booking-card";

const submitMock = vi.fn();
vi.mock("@/app/(admin)/admin/agents/queue/actions", () => ({
  submitSiteVisitBookingAction: (...a: unknown[]) => submitMock(...a),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

function fillForm() {
  fireEvent.change(screen.getByTestId("site-visit-scheduled-at"), {
    target: { value: "2026-05-20T11:30" },
  });
  fireEvent.change(screen.getByTestId("site-visit-pickup-time"), {
    target: { value: "2026-05-20T10:00" },
  });
  fireEvent.change(screen.getByTestId("site-visit-pickup-address"), {
    target: { value: "12 MG Road" },
  });
  fireEvent.change(screen.getByTestId("site-visit-cab-provider"), {
    target: { value: "Local fleet" },
  });
  fireEvent.change(screen.getByTestId("site-visit-driver-name"), {
    target: { value: "Suresh K" },
  });
  fireEvent.change(screen.getByTestId("site-visit-driver-phone"), {
    target: { value: "+919900022222" },
  });
  fireEvent.change(screen.getByTestId("site-visit-vehicle-number"), {
    target: { value: "KA01AB1234" },
  });
}

describe("<SiteVisitBookingCard>", () => {
  it("renders the cab form fields", () => {
    render(
      <SiteVisitBookingCard
        queueId="q-1"
        leadId="lead-1"
        leadLabel="Rohit Menon"
      />,
    );
    expect(screen.getByTestId("site-visit-booking-card-q-1")).toBeDefined();
    expect(screen.getByTestId("site-visit-scheduled-at")).toBeDefined();
    expect(screen.getByTestId("site-visit-pickup-address")).toBeDefined();
    expect(screen.getByTestId("site-visit-driver-phone")).toBeDefined();
    expect(screen.getByTestId("site-visit-booking-submit-q-1")).toBeDefined();
  });

  it("blocks submit with a validation error when fields are empty", () => {
    render(
      <SiteVisitBookingCard
        queueId="q-1"
        leadId="lead-1"
        leadLabel="Rohit Menon"
      />,
    );
    fireEvent.click(screen.getByTestId("site-visit-booking-submit-q-1"));
    expect(
      screen.getByTestId("site-visit-booking-error-q-1").textContent,
    ).toMatch(/visit date/i);
    expect(submitMock).not.toHaveBeenCalled();
  });

  it("submits the cab details and shows the booked confirmation", async () => {
    submitMock.mockResolvedValue({
      ok: true,
      dispatch: "sent",
      assigned: true,
    });
    render(
      <SiteVisitBookingCard
        queueId="q-1"
        leadId="lead-1"
        leadLabel="Rohit Menon"
      />,
    );
    fillForm();
    fireEvent.click(screen.getByTestId("site-visit-booking-submit-q-1"));

    await waitFor(() => expect(submitMock).toHaveBeenCalledOnce());
    const [queueId, cab] = submitMock.mock.calls[0];
    expect(queueId).toBe("q-1");
    expect(cab).toMatchObject({
      pickup_address: "12 MG Road",
      cab_provider: "Local fleet",
      driver_name: "Suresh K",
      vehicle_number: "KA01AB1234",
    });
    // ISO conversion happened.
    expect(typeof cab.scheduled_at).toBe("string");
    expect(cab.scheduled_at).toContain("2026-05-20");

    await waitFor(() => {
      const done = screen.getByTestId("site-visit-booking-done-q-1");
      expect(done.textContent).toMatch(/Sales rep auto-assigned/i);
      expect(done.textContent).toMatch(/Customer notified/i);
    });
  });

  it("surfaces a server-side error", async () => {
    submitMock.mockResolvedValue({
      ok: false,
      error: "validation",
      message: "Invalid cab details",
    });
    render(
      <SiteVisitBookingCard
        queueId="q-1"
        leadId="lead-1"
        leadLabel="Rohit Menon"
      />,
    );
    fillForm();
    fireEvent.click(screen.getByTestId("site-visit-booking-submit-q-1"));
    await waitFor(() =>
      expect(
        screen.getByTestId("site-visit-booking-error-q-1").textContent,
      ).toMatch(/invalid cab details/i),
    );
  });
});
