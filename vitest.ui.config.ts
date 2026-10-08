import path from "node:path";
import { defineConfig, mergeConfig } from "vitest/config";
import shared from "./vitest.shared.config";

export default mergeConfig(
  shared,
  defineConfig({
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./app"),
        "@twilio/voice-sdk": path.resolve(__dirname, "test/mocks/twilio-voice-sdk.ts"),
      },
    },
    test: {
      name: "ui",
      environment: "jsdom",
      // The vendored scriptkit editor is consumed only by this app, and its
      // own `npm test` never runs in CI (nothing builds or tests vendor/).
      // Run its React tests here so the state machine is covered by the same
      // gate as the app that depends on it.
      include: [
        "test/ui/**/*.test.{ts,tsx,js,jsx}",
        "vendor/scriptkit/**/test/**/*.test.{ts,tsx}",
      ],
      setupFiles: ["test/setup.ui.ts"],
      pool: "forks",
      maxWorkers: 2,
      isolate: true,
      // Vitest defaults to 5s, which already-imported route modules miss when
      // the box is under load (repeated full gates, CI peers): hydration tests
      // burn time in React-router import + render, and a timed-out test leaves
      // a mounted router behind, failing the next test in the same file. The
      // node suite already runs at 60s; 20s absorbs the load spike without
      // hiding real hangs.
      testTimeout: 20_000,
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
          "app/routes/**/*.{ts,tsx,js,jsx}",
          // NOTE: do not add a bare "shared/**" here — istanbul's test-exclude
          // treats it as "**/shared/**", silently dropping app/components/shared
          // from coverage. The `include: app/**` already keeps top-level dirs out.
          "twilio-serverless/**",
        ],
      },
    },
  }),
);
