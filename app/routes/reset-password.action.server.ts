import { data as routeData } from "react-router";
import { auth } from "@/server/auth-instance";
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

    const password = passwordRaw.trim();
    const confirmPassword = confirmPasswordRaw.trim();

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
    } catch {
      // Always return a generic success message regardless of token validity.
    }

    return routeData({ success: true, error: null });
  },
});
