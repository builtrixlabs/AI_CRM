import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    // Integration tests hit a real Supabase preview branch — slower than unit tests.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Run sequentially so beforeAll seeds don't race across files.
    fileParallelism: false,
  },
});
