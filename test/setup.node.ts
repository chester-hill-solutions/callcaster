import { beforeAll, vi } from "vitest";

beforeAll(() => {
  process.env.NODE_ENV = "test";

  // Satisfy `app/lib/env.server.ts` required getters in tests.
  process.env.SUPABASE_URL ??= "http://localhost:54321";
  process.env.SUPABASE_ANON_KEY ??= "test-anon";
  process.env.SUPABASE_SERVICE_KEY ??= "test-service";
  process.env.SUPABASE_PUBLISHABLE_KEY ??= "test-publishable";
  process.env.TWILIO_SID ??= "AC_test";
  process.env.TWILIO_AUTH_TOKEN ??= "twilio-token";
  process.env.TWILIO_APP_SID ??= "AP_test";
  process.env.TWILIO_PHONE_NUMBER ??= "+15555550100";
  process.env.BASE_URL ??= "http://localhost";
  process.env.STRIPE_SECRET_KEY ??= "sk_test";
  process.env.RESEND_API_KEY ??= "re_test";
});

// Most unit tests should not hit the network.
vi.stubGlobal(
  "fetch",
  vi.fn(async () => {
    throw new Error("Global fetch called without a test stub");
  }),
);

vi.mock("@/lib/logger.server", () => {
  return {
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  };
});

vi.mock("@/lib/logger.client", () => {
  return {
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  };
});

