import { beforeAll, vi } from "vitest";
import "./setup-route-auth-mock";
import "./helpers/route-auth-mock";

beforeEach(() => {
  process.env.NODE_ENV = "test";

  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
  process.env.BETTER_AUTH_SECRET ??= "test-better-auth-secret";
  process.env.BASE_URL = "http://localhost";
  process.env.TWILIO_SID ??= "AC_test";
  process.env.TWILIO_AUTH_TOKEN ??= "twilio-token";
  process.env.TWILIO_APP_SID ??= "AP_test";
  process.env.TWILIO_PHONE_NUMBER ??= "+15555550100";
  process.env.STRIPE_SECRET_KEY ??= "sk_test";
  process.env.RESEND_API_KEY ??= "re_test";
  process.env.S3_ENDPOINT ??= "http://localhost:9000";
  process.env.S3_REGION ??= "us-east-1";
  process.env.S3_ACCESS_KEY_ID ??= "test-access-key";
  process.env.S3_SECRET_ACCESS_KEY ??= "test-secret-key";
  process.env.S3_BUCKET ??= "callcaster-test";
});

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
