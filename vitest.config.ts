import { defineConfig } from "vitest/config";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    setupFiles: ["./tests/setup-rtl.ts"],
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    exclude: [
      "tests/integration/**",
      "tests/e2e/**",
      "node_modules/**",
      "plugin/**",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: [
        "src/lib/auth/**",
        "src/lib/canvas/**",
        "src/components/canvas/**",
        "src/lib/leads/**",
        "src/lib/cmdk/**",
        "src/app/(dashboard)/dashboard/_actions/**",
      ],
      thresholds: {
        lines: 80,
        branches: 90,
      },
    },
  },
});
