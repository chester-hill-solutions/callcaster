import { beforeEach, describe, expect, test, vi } from "vitest";

const resendMocks = vi.hoisted(() => ({
  send: vi.fn(async () => ({ data: { id: "email_1" }, error: null })),
}));

const loggerMocks = vi.hoisted(() => ({
  error: vi.fn(),
}));

vi.mock("resend", () => {
  class Resend {
    emails = { send: (...args: unknown[]) => resendMocks.send(...args) };
    constructor(_apiKey: string) {}
  }
  return { Resend };
});

vi.mock("@/lib/env.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/env.server")>()),
  env: {
    ...(await importOriginal<typeof import("@/lib/env.server")>()).env,
    BASE_URL: () => "http://localhost:3100",
    RESEND_API_KEY: () => "test-key",
  },
}));

vi.mock("@/lib/logger.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/logger.server")>()),
  logger: loggerMocks,
}));

import {
  sendVerificationEmail,
  sendAccountExistsEmail,
  verificationUrlFrom,
} from "../app/lib/send-verification-email.server";

describe("sendVerificationEmail (Better Auth emailVerification.sendVerificationEmail)", () => {
  beforeEach(() => {
    resendMocks.send.mockClear();
    loggerMocks.error.mockClear();
  });

  test("mails a link to a route this app serves a GET for", async () => {
    await sendVerificationEmail({
      user: { email: "new@e2e.test" },
      url: "http://localhost:3100/api/auth/verify-email?token=tok-123&callbackURL=%2F",
      token: "tok-123",
    });

    expect(resendMocks.send).toHaveBeenCalledTimes(1);
    const call = resendMocks.send.mock.calls[0]?.[0] as {
      to: string[];
      subject: string;
      html: string;
      text: string;
    };
    expect(call.to).toEqual(["new@e2e.test"]);
    expect(call.subject).toMatch(/verify/i);
    expect(call.text).toContain(
      "http://localhost:3100/auth/confirm?token_hash=tok-123&type=email&next=%2Fworkspaces",
    );
    // Better Auth's own URL is a GET to /api/auth/verify-email, which this app
    // serves as the JSON POST twin only (app/routes/api+/auth/verify-email.route.tsx).
    // Shipping it in the mail would hand the user a link that cannot be opened.
    expect(call.text).not.toContain("/api/auth/verify-email");
  });

  test("keeps the origin Better Auth computed instead of trusting a request host", () => {
    // A verification link that honours the caller's Host header mails the user
    // the attacker's origin. The rewrite must preserve Better Auth's origin,
    // which derives from BETTER_AUTH_URL/BASE_URL.
    const link = verificationUrlFrom(
      "https://app.callcaster.ca/api/auth/verify-email?token=tok-123&callbackURL=%2F",
      "tok-123",
    );
    expect(link.startsWith("https://app.callcaster.ca/auth/confirm?")).toBe(
      true,
    );
    expect(link).not.toContain("attacker.invalid");
  });

  test("swallows and logs a send failure instead of throwing", async () => {
    resendMocks.send.mockRejectedValueOnce(new Error("Resend API down"));

    await expect(
      sendVerificationEmail({
        user: { email: "new@e2e.test" },
        url: "http://localhost:3100/api/auth/verify-email?token=tok-123&callbackURL=%2F",
        token: "tok-123",
      }),
    ).resolves.toBeUndefined();

    expect(loggerMocks.error).toHaveBeenCalledWith(
      "transactional_email.send.failed",
      expect.objectContaining({ error: "Resend API down" }),
    );
  });

  test("the duplicate-address mail points at sign-in and carries no token", async () => {
    // Better Auth answers a duplicate sign-up with a synthetic user and no mail
    // of its own, so this is the only message that path sends. It must not look
    // like a verification mail, and it must not imply a token exists (#2216).
    await sendAccountExistsEmail({ user: { email: "taken@e2e.test" } });

    const call = resendMocks.send.mock.calls[0]?.[0] as {
      to: string[];
      subject: string;
      text: string;
    };
    expect(call.to).toEqual(["taken@e2e.test"]);
    expect(call.subject).toMatch(/already have a CallCaster account/i);
    expect(call.text).toContain("http://localhost:3100/signin");
    expect(call.text).not.toContain("token_hash");
  });
});
