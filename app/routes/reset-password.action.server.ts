import { data as routeData } from "react-router";
import { auth } from "@/server/auth-instance";
import { logger } from "@/lib/logger.server";
import { enforceAuthRateLimit } from "@/lib/platform-auth-rate-limit.server";
import { defineAction } from "@/lib/handler.server";
import {
  INVALID_RESET_LINK_MESSAGE,
  PASSWORD_MIN_LENGTH_MESSAGE,
  PASSWORD_TOO_LONG_MESSAGE,
} from "../../shared/auth-policy";

const REJECTION_MESSAGES = new Map<string, string>([
  ["PASSWORD_TOO_SHORT", PASSWORD_MIN_LENGTH_MESSAGE],
  ["PASSWORD_TOO_LONG", PASSWORD_TOO_LONG_MESSAGE],
]);

/** Better Auth reports why it refused on the APIError body. */
function rejectionCode(error: unknown): string | undefined {
  return (error as { body?: { code?: string } } | null)?.body?.code;
}

/**
 * Name the reason Better Auth refused (#2075). Collapsing every refusal into
 * "the link is invalid" sent users hunting for a new email when the token was
 * fine and the password was the problem.
 */
function rejectionMessage(code: string | undefined): string {
  return (
    (code ? REJECTION_MESSAGES.get(code) : undefined) ?? INVALID_RESET_LINK_MESSAGE
  );
}

export const action = defineAction({
  sideEffects: ["db-write"],
  handler: async ({ request, url }) => {
    // The reset token is a credential, so this is a guessing surface (#2220).
    // Same bucket as the JSON twin at api+/auth/reset-password.
    const limited = await enforceAuthRateLimit(request, "auth:reset-password");
    if (limited) {
      return routeData(
        {
          success: null,
          error: { message: "Too many attempts. Wait a minute and try again." },
        },
        { status: 429 },
      );
    }

    const formData = await request.formData();
    const passwordRaw = formData.get("password");
    const confirmPasswordRaw =
      formData.get("confirm_password") ?? formData.get("confirmPassword");

    if (typeof passwordRaw !== "string" || typeof confirmPasswordRaw !== "string") {
      return routeData({
        success: null,
        error: { message: "Invalid form submission" },
      });
    }

    // Passwords are compared and stored exactly as typed; trimming here would
    // store a different secret than the user will sign in with.
    const password = passwordRaw;
    const confirmPassword = confirmPasswordRaw;

    if (password !== confirmPassword) {
      return routeData({
        success: null,
        error: { message: "Passwords do not match" },
      });
    }

    const token = url.searchParams.get("token") ?? "";

    try {
      await auth.api.resetPassword({
        body: { newPassword: password, token },
        headers: request.headers,
      });
    } catch (error) {
      // The token IS the credential here, so surfacing its failure leaks
      // nothing (unlike forgot-password, which stays generic to avoid account
      // enumeration). A silent "success" strands the user at sign-in.
      const code = rejectionCode(error);
      logger.warn("reset-password: reset rejected", {
        code,
        error: error instanceof Error ? error.message : String(error),
      });
      return routeData(
        {
          success: null,
          error: { message: rejectionMessage(code) },
        },
        { status: 400 },
      );
    }

    return routeData({ success: true, error: null });
  },
});
