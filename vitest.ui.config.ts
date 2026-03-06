import { defineConfig, mergeConfig } from "vitest/config";
import shared from "./vitest.shared.config";

export default mergeConfig(
  shared,
  defineConfig({
    test: {
      name: "ui",
      environment: "jsdom",
      include: ["test/ui/**/*.test.{ts,tsx,js,jsx}"],
      setupFiles: ["test/setup.ui.ts"],
      coverage: {
        provider: "istanbul",
        reportsDirectory: "coverage/vitest-ui",
        reporter: ["text", "html", "lcov"],
        all: false,
        include: ["app/**/*.{ts,tsx,js,jsx}"],
        exclude: [
          "**/*.d.ts",
          "**/*.test.{ts,tsx,js,jsx}",
          "**/node_modules/**",
          "app/**/*.server.{ts,tsx,js,jsx}",
          // Covered via the Node suite to avoid cross-transform LCOV mismatches.
          "app/lib/type-utils.ts",
          "app/lib/type-safety-utils.ts",
          "app/routes/api*.{ts,tsx,js,jsx}",
          "app/routes/archive/**",
          "app/routes/old.*",
          "supabase/functions/**",
          "twilio-serverless/**",
        ],
      },
    },
  }),
);

