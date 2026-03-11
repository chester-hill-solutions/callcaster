import { defineConfig, mergeConfig } from "vitest/config";
import shared from "./vitest.shared.config";

export default mergeConfig(
  shared,
  defineConfig({
    test: {
      name: "node",
      environment: "node",
      testTimeout: 60000,
      include: ["test/**/*.test.ts"],
      exclude: ["test/ui/**"],
      setupFiles: ["test/setup.node.ts"],
      coverage: {
        provider: "istanbul",
        reportsDirectory: "coverage/vitest-node",
        reporter: ["text", "html", "lcov"],
        all: false,
        include: [
          "app/lib/**/*.{ts,tsx,js,jsx}",
          "app/routes/api*.{ts,tsx,js,jsx}",
          "app/**/*.server.{ts,tsx,js,jsx}",
          "app/twilio.server.{ts,js}",
        ],
        exclude: [
          "**/*.d.ts",
          "**/*.test.{ts,tsx,js,jsx}",
          "**/node_modules/**",
          "app/components/**",
          "app/hooks/**",
          "app/entry.client.*",
          // Client-only utilities (covered via the UI/JSDOM suite).
          "app/lib/**/*.client.{ts,tsx,js,jsx}",
          "app/lib/callscreenActions.ts",
          "app/lib/csvDownload.ts",
          "app/lib/errors.client.ts",
          "app/lib/form-validation.ts",
          "app/routes/archive/**",
          "app/routes/old.*",
          "supabase/functions/**",
        ],
      },
    },
  }),
);

