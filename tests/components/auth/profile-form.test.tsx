// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  action: vi.fn(),
  setTheme: vi.fn(),
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({ setTheme: mocks.setTheme }),
}));

import { ProfileForm } from "@/components/auth/profile-form";

beforeEach(() => {
  mocks.action.mockReset();
  mocks.setTheme.mockReset();
});

const baseProps = {
  email: "asha@example.com",
  display_name: "Asha Pillai",
  phone: "+91-9000000000",
  theme: "system" as const,
  notification_prefs: {
    email_enabled: true,
    in_app_enabled: true,
    digest_frequency: "daily" as const,
  },
  action: mocks.action,
};

describe("ProfileForm", () => {
  it("renders email as a disabled input", () => {
    render(<ProfileForm {...baseProps} />);
    const email = screen.getByLabelText(/sign-in identity/i) as HTMLInputElement;
    expect(email.value).toBe("asha@example.com");
    expect(email.disabled).toBe(true);
  });

  it("renders display name and phone with the supplied defaults", () => {
    render(<ProfileForm {...baseProps} />);
    expect((screen.getByLabelText(/Display name/i) as HTMLInputElement).value).toBe(
      "Asha Pillai",
    );
    expect((screen.getByLabelText(/Phone/i) as HTMLInputElement).value).toBe(
      "+91-9000000000",
    );
  });

  it("calls the injected action and renders 'Saved.' on success", async () => {
    mocks.action.mockResolvedValue({ ok: true });
    render(<ProfileForm {...baseProps} />);
    fireEvent.submit(screen.getByTestId("profile-form"));
    await waitFor(() => expect(mocks.action).toHaveBeenCalledOnce());
    expect(await screen.findByText("Saved.")).toBeInTheDocument();
  });

  it("renders the error message on validation failure", async () => {
    mocks.action.mockResolvedValue({
      ok: false,
      error: "validation",
      message: "Display name is required",
    });
    render(<ProfileForm {...baseProps} />);
    fireEvent.submit(screen.getByTestId("profile-form"));
    expect(await screen.findByText("Display name is required")).toBeInTheDocument();
  });

  it("syncs theme via next-themes when the user picks a different option before submitting", async () => {
    mocks.action.mockResolvedValue({ ok: true });
    render(<ProfileForm {...baseProps} />);
    fireEvent.click(screen.getByLabelText("dark"));
    fireEvent.submit(screen.getByTestId("profile-form"));
    await waitFor(() => expect(mocks.setTheme).toHaveBeenCalledWith("dark"));
  });

  it("disables the save button while pending", async () => {
    let resolve!: (v: { ok: true }) => void;
    mocks.action.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    render(<ProfileForm {...baseProps} />);
    fireEvent.submit(screen.getByTestId("profile-form"));
    const saveBtn = screen.getByRole("button", { name: /saving|save changes/i });
    await waitFor(() => expect(saveBtn).toBeDisabled());
    resolve({ ok: true });
  });
});
