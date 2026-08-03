import { auth } from "@/server/auth-instance";
import { data as routeData } from "react-router";
import { env } from "@/lib/env.server";
import { rateLimitedPostAuth } from "@/lib/platform-auth-rate-limit.server";
import { defineAction } from "@/lib/handler.server";

export const action = defineAction({
  // Unauthenticated and it sends mail, so without a limit it is an
  // email-bombing and account-enumeration primitive. Its sibling
  // api+/auth/forgot-password already gates the same operation this way.
  auth: rateLimitedPostAuth("auth:forgot-password"),
  sideEffects: ["email"],
  handler: async ({ request }) => {
    const formData = await request.formData();
    const email = formData.get("email");
    if (typeof email !== "string" || !email) {
      return routeData({ data: null, error: { message: "Email is required" } });
    }
    try {
      await auth.api.requestPasswordReset({
        // Pinned to the configured base URL, not the request's own origin: a
        // forwarded-host header would otherwise put the reset link — and the
        // token in it — on a host the caller chose.
        body: { email, redirectTo: `${env.BASE_URL()}/api/auth/callback` },
        headers: request.headers,
      });
      return routeData({ data: { success: true }, error: null });
    } catch (error: any) {
      return routeData({ data: null, error: { message: error?.message || "Failed to send reset email" } });
    }
  },
});
