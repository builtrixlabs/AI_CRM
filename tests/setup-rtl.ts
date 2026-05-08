import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test-project.supabase.co");
vi.stubEnv(
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "sb_publishable_test_key_for_unit_tests_only",
);

afterEach(() => {
  cleanup();
});
