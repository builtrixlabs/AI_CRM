import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test-project.supabase.co");
vi.stubEnv(
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "sb_publishable_test_key_for_unit_tests_only",
);

// jsdom doesn't ship ResizeObserver; cmdk + Radix use it. Polyfill no-op.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class ResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  } as unknown as typeof ResizeObserver;
}

// jsdom Element doesn't define scrollIntoView; cmdk calls it on selected items.
if (
  typeof Element !== "undefined" &&
  typeof Element.prototype.scrollIntoView !== "function"
) {
  Element.prototype.scrollIntoView = function () {};
}

afterEach(() => {
  cleanup();
});
