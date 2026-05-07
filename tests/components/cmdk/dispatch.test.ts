// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  ACTION_HANDLERS,
  defaultToggleTheme,
} from "@/components/cmdk/dispatch";

describe("ACTION_HANDLERS", () => {
  let ctx: {
    push: ReturnType<typeof vi.fn>;
    openNewLeadDialog: ReturnType<typeof vi.fn>;
    toggleTheme: ReturnType<typeof vi.fn>;
    signOut: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    ctx = {
      push: vi.fn(),
      openNewLeadDialog: vi.fn(),
      toggleTheme: vi.fn(),
      signOut: vi.fn().mockResolvedValue(undefined),
    };
  });

  it("open-new-lead-dialog calls ctx.openNewLeadDialog", () => {
    ACTION_HANDLERS["open-new-lead-dialog"](ctx);
    expect(ctx.openNewLeadDialog).toHaveBeenCalledOnce();
  });

  it("toggle-theme calls ctx.toggleTheme", () => {
    ACTION_HANDLERS["toggle-theme"](ctx);
    expect(ctx.toggleTheme).toHaveBeenCalledOnce();
  });

  it("sign-out awaits ctx.signOut", async () => {
    await ACTION_HANDLERS["sign-out"](ctx);
    expect(ctx.signOut).toHaveBeenCalledOnce();
  });

  it("open-lead-by-name is a no-op (palette intercepts)", () => {
    expect(() => ACTION_HANDLERS["open-lead-by-name"](ctx)).not.toThrow();
    expect(ctx.openNewLeadDialog).not.toHaveBeenCalled();
  });
});

describe("defaultToggleTheme", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute("data-theme");
    try {
      window.localStorage.removeItem("theme");
    } catch {
      // jsdom: localStorage available; tolerated.
    }
  });

  it("flips light → dark on first call", () => {
    defaultToggleTheme();
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(window.localStorage.getItem("theme")).toBe("dark");
  });

  it("flips back dark → light on second call", () => {
    defaultToggleTheme(); // → dark
    defaultToggleTheme(); // → light
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(window.localStorage.getItem("theme")).toBe("light");
  });

  it("does not throw when localStorage write fails", () => {
    const originalSet = window.localStorage.setItem;
    window.localStorage.setItem = () => {
      throw new Error("quota");
    };
    try {
      expect(() => defaultToggleTheme()).not.toThrow();
    } finally {
      window.localStorage.setItem = originalSet;
    }
  });
});
