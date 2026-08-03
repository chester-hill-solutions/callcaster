import { getSafeRedirectPath } from "@/lib/safe-redirect";
import { redirect, data as routeData } from "react-router";
import { auth } from "@/server/auth-instance";
import { mergeBetterAuthSetCookieHeaders } from "@/lib/better-auth-headers.server";
import { defineAction } from "@/lib/handler.server";
import { enforceAuthRateLimit } from "@/lib/platform-auth-rate-limit.server";

export const action = defineAction({
  sideEffects: ["db-write"],
  handler: async ({ request }) => {
    // TOTP codes are 6 digits — same strict bucket as sign-in so codes can't
    // be brute-forced, with a form-friendly error.
    const limited = await enforceAuthRateLimit(request, "auth:sign-in");
    if (limited) {
      return routeData(
        { error: "Too many attempts. Wait a minute and try again." },
        { status: 429 },
      );
    }

    const formData = await request.formData();
    const code = String(formData.get("code") ?? "").trim();
    const next = String(formData.get("next") ?? "").trim();
    const trustDevice = formData.get("trustDevice") === "on";

    if (!code) {
      return routeData({ error: "Enter your authentication code" });
    }

    try {
      const authApi = auth.api as typeof auth.api & {
        verifyTOTP: (args: Record<string, unknown>) => Promise<{ headers?: Headers; response?: unknown }>;
      };
      const result = await authApi.verifyTOTP({
        body: { code, trustDevice },
        headers: request.headers,
        returnHeaders: true,
      });

      const payload = result?.response ?? result;
      if (!payload || typeof payload !== "object") {
        return routeData({ error: "Verification failed" });
      }

      const headers = mergeBetterAuthSetCookieHeaders(result?.headers);

      throw redirect(
        getSafeRedirectPath(next, {
          fallback: "/workspaces",
          disallowPrefixes: ["/signin"],
        }),
        { headers },
      );
    } catch (error) {
      if (error instanceof Response) {
        throw error;
      }
      return routeData({
        error: error instanceof Error ? error.message : "Verification failed",
      });
    }
  },
});
