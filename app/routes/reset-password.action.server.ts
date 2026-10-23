import { data as routeData } from "react-router";
import { auth } from "@/server/auth-instance";
import { logger } from "@/lib/logger.server";
import { enforceAuthRateLimit } from "@/lib/platform-auth-rate-limit.server";
import { defineAction } from "@/lib/handler.server";
import { PASSWORD_MIN_LENGTH_MESSAGE } from "../../shared/password-policy";

const INVALID_RESET_LINK_MESSAGE =
  "This reset link is invalid or has expired. Request a new one from the sign-in page.";

/**
 * Better Auth reports why it refused: a short password, a long password, or a
 * token it cannot consume. Collapsing every one of those into "the link is
 * invalid" sent users hunting for a new email when the real problem was the
 * password they had just typed (#2075).
 */
function resetRejectionMessage(error: unknown): string {
  const code = (error as { body?: { code?: string } } | null)?.body?.code;
  if (code === "PASSWORD_TOO_SHORT") return PASSWORD_MIN_LENGTH_MESSAGE;
  if (code === "PASSWORD_TOO_LONG") return "Password is too long.";
  return INVALID_RESET_LINK_MESSAGE;
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
      const code = (error as { body?: { code?: string } } | null)?.body?.code;
      logger.warn("reset-password: reset rejected", {
        code,
        error: error instanceof Error ? error.message : String(error),
      });
      return routeData(
        {
          success: null,
          error: { message: resetRejectionMessage(error) },
        },
        { status: 400 },
      );
    }

    return routeData({ success: true, error: null });
  },
});
