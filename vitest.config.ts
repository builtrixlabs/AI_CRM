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
        "src/lib/ai/budget.ts",
        "src/lib/ai/ledger.ts",
        "src/lib/ai/gateway.ts",
        "src/lib/ai/types.ts",
        "src/lib/agents/**",
        "src/lib/nodes/text.ts",
        "src/lib/webhooks/**",
        "src/lib/doe/**",
        "src/lib/sitevisits/**",
        "src/lib/events/**",
        "src/app/(dashboard)/dashboard/_actions/**",
      ],
      exclude: [
        // Thin SDK boundary wrappers; tested indirectly via the
        // gateway's fallback paths with provider mocks.
        "src/lib/ai/providers/**",
      ],
      thresholds: {
        lines: 80,
        branches: 90,
      },
    },
  },
});
