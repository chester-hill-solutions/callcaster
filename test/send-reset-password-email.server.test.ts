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

vi.mock("@/lib/env.server", () => ({
  env: {
    RESEND_API_KEY: () => "test-key",
  },
}));

vi.mock("@/lib/logger.server", () => ({
  logger: loggerMocks,
}));

import { sendResetPasswordEmail } from "../app/lib/send-reset-password-email.server";

describe("sendResetPasswordEmail (Better Auth emailAndPassword.sendResetPassword)", () => {
  beforeEach(() => {
    resendMocks.send.mockClear();
    loggerMocks.error.mockClear();
  });

  test("emails the reset link to the user via the existing Resend sender", async () => {
    await sendResetPasswordEmail({
      user: { email: "owner@e2e.test" },
      url: "http://localhost:3100/api/auth/reset-password/tok-123?callbackURL=%2Freset-password",
      token: "tok-123",
    });

    expect(resendMocks.send).toHaveBeenCalledTimes(1);
    const call = resendMocks.send.mock.calls[0]![0] as {
      to: string[];
      subject: string;
      html: string;
      text: string;
      from: string;
    };
    expect(call.to).toEqual(["owner@e2e.test"]);
    expect(call.from).toBe("Callcaster <info@callcaster.ca>");
    expect(call.html).toContain(
      "http://localhost:3100/api/auth/reset-password/tok-123?callbackURL=%2Freset-password",
    );
    expect(call.text).toContain("tok-123");
  });

  test("swallows and logs a send failure instead of throwing (matches Better Auth's generic response)", async () => {
    resendMocks.send.mockRejectedValueOnce(new Error("Resend API down"));

    await expect(
      sendResetPasswordEmail({
        user: { email: "owner@e2e.test" },
        url: "http://localhost:3100/reset-password?token=tok-123",
        token: "tok-123",
      }),
    ).resolves.toBeUndefined();

    expect(loggerMocks.error).toHaveBeenCalledWith(
      "send_reset_password_email.failed",
      expect.objectContaining({ error: "Resend API down" }),
    );
  });
});
