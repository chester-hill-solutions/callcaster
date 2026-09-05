import { data as routeData } from "react-router";
import { auth } from "@/server/auth-instance";
import { logger } from "@/lib/logger.server";
import { defineAction } from "@/lib/handler.server";

export const action = defineAction({
  sideEffects: ["db-write"],
  handler: async ({ request, url }) => {
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
      logger.warn("reset-password: reset rejected", {
        error: error instanceof Error ? error.message : String(error),
      });
      return routeData(
        {
          success: null,
          error: {
            message:
              "This reset link is invalid or has expired. Request a new one from the sign-in page.",
          },
        },
        { status: 400 },
      );
    }

    return routeData({ success: true, error: null });
  },
});
