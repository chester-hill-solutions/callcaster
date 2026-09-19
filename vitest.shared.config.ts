import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./app"),
    },
  },
  test: {
    globals: true,
    // Date/Intl assertions must not depend on the runner's timezone. Pin the
    // whole suite once (node + ui) instead of remembering it per test file.
    // Node honours a runtime `process.env.TZ` change, and Vitest applies
    // `env` in each worker before setup and test modules load.
    env: { TZ: "UTC" },
    clearMocks: true,
    restoreMocks: true,
    mockReset: true,
  },
});

