import { defineConfig, mergeConfig } from "vitest/config";
import shared from "./vitest.shared.config";

/**
 * Twilio test-credential tier (#1195).
 *
 * Runs the real Twilio SDK against Twilio Test Credentials and magic numbers,
 * which cost nothing and never reach a carrier, to pin the request shape the
 * app sends for calls and messages and the error codes Twilio answers with.
 * Test credentials do NOT run webhooks, TwiML, recordings, voicemail, or
 * delivery, so nothing here asserts on those; that is E2E territory.
 *
 * Deliberately no `setupFiles`: the suites gate on the real environment.
 *
 * Run with:
 *   TWILIO_TEST_ACCOUNT_SID=ACxxxx TWILIO_TEST_AUTH_TOKEN=xxxx npm run test:integration-twilio
 */
export default mergeConfig(
  shared,
  defineConfig({
    test: {
      name: "integration-twilio",
      environment: "node",
      testTimeout: 30_000,
      hookTimeout: 30_000,
      include: ["test/integration-twilio/**/*.test.ts"],
      fileParallelism: false,
    },
  }),
);
