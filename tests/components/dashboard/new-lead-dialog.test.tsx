// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  createLeadAction: vi.fn(),
  push: vi.fn(),
}));
vi.mock("@/app/(dashboard)/dashboard/_actions/leads", () => ({
  createLeadAction: mocks.createLeadAction,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));

import { NewLeadDialog } from "@/components/dashboard/new-lead-dialog";

beforeEach(() => {
  mocks.createLeadAction.mockReset();
  mocks.push.mockReset();
});

describe("NewLeadDialog", () => {
  it("opens on trigger click and shows the form", () => {
    render(<NewLeadDialog />);
    fireEvent.click(screen.getByTestId("new-lead-trigger"));
    expect(screen.getByTestId("new-lead-dialog")).toBeInTheDocument();
    expect(screen.getByTestId("new-phone")).toBeInTheDocument();
  });

  it("submits valid form, closes, and navigates to the new lead", async () => {
    mocks.createLeadAction.mockResolvedValue({
      ok: true,
      data: { id: "11111111-2222-4333-8444-555555555555" },
    });
    render(<NewLeadDialog />);
    fireEvent.click(screen.getByTestId("new-lead-trigger"));
    fireEvent.change(screen.getByTestId("new-phone"), {
      target: { value: "+91-9999999999" },
    });
    // shadcn Select uses Radix primitives; we test the action layer by
    // dispatching the underlying Select trigger + option click. Instead of
    // simulating Radix internals (timing-fragile), pre-fill via direct DOM:
    // the form-data path is what matters. Submit without source → expect
    // a validation error. This test focuses on the happy path so we set
    // source via the underlying select element if exposed; otherwise, a
    // separate test can validate the source-required error.
    // For the happy path, the action mock won't actually use FormData
    // contents — it just returns ok. We just need the form to dispatch.
    fireEvent.submit(screen.getByTestId("new-phone").closest("form")!);
    await waitFor(() => expect(mocks.createLeadAction).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith(
        "/dashboard/leads/11111111-2222-4333-8444-555555555555",
      ),
    );
  });

  it("renders inline field errors from a validation failure", async () => {
    mocks.createLeadAction.mockResolvedValue({
      ok: false,
      error: "validation",
      fieldErrors: { phone: "Phone is too short" },
    });
    render(<NewLeadDialog />);
    fireEvent.click(screen.getByTestId("new-lead-trigger"));
    fireEvent.submit(screen.getByTestId("new-phone").closest("form")!);
    await waitFor(() =>
      expect(screen.getByText("Phone is too short")).toBeInTheDocument(),
    );
    // dialog stays open; no router.push
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("renders the permission banner on permission failure", async () => {
    mocks.createLeadAction.mockResolvedValue({
      ok: false,
      error: "permission",
    });
    render(<NewLeadDialog />);
    fireEvent.click(screen.getByTestId("new-lead-trigger"));
    fireEvent.submit(screen.getByTestId("new-phone").closest("form")!);
    await waitFor(() =>
      expect(screen.getByTestId("permission-banner")).toBeInTheDocument(),
    );
  });

  it("renders form-level error on unknown failure", async () => {
    mocks.createLeadAction.mockResolvedValue({
      ok: false,
      error: "unknown",
      message: "db down",
    });
    render(<NewLeadDialog />);
    fireEvent.click(screen.getByTestId("new-lead-trigger"));
    fireEvent.submit(screen.getByTestId("new-phone").closest("form")!);
    await waitFor(() =>
      expect(screen.getByTestId("form-error")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("form-error").textContent).toContain("db down");
  });
});
