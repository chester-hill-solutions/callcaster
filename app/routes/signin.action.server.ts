import { loginWithPassword } from "@/lib/platform-auth.server";
import { mergeBetterAuthSetCookieHeaders } from "@/lib/better-auth-headers.server";
import { data as routeData, redirect } from "react-router";
import { getSafeRedirectPath } from "@/lib/safe-redirect";
import { logger } from "@/lib/logger.server";
import { defineAction } from "@/lib/handler.server";
import { enforceAuthRateLimit } from "@/lib/platform-auth-rate-limit.server";

export const action = defineAction({
  sideEffects: ["db-write"],
  handler: async ({ request, url }) => {
    // Browser sign-in is the primary credential-guessing surface — same
    // strict bucket as the API sign-in path, but with a form-friendly error.
    const limited = await enforceAuthRateLimit(request, "auth:sign-in");
    if (limited) {
      return routeData(
        { error: "Too many sign-in attempts. Wait a minute and try again." },
        { status: 429 },
      );
    }

    const next = url.searchParams.get("next");

    const formData = await request.formData();
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    const login = await loginWithPassword(request, email, password);

    if (login.ok && "twoFactorRedirect" in login && login.twoFactorRedirect) {
      const headers = login.headers;
      const nextParam = next ? `&next=${encodeURIComponent(next)}` : "";
      return redirect(`/two-factor?methods=${encodeURIComponent((login.twoFactorMethods ?? ["totp"]).join(","))}${nextParam}`, {
        headers,
      });
    }

    if (login.ok && "token" in login) {
      const headers = mergeBetterAuthSetCookieHeaders(login.headers);
      return redirect(
        getSafeRedirectPath(next, {
          fallback: "/workspaces",
          disallowPrefixes: ["/signin"],
        }),
        { headers },
      );
    }
    logger.error("Sign-in error", !login.ok ? login.error : "Two-factor required");
    return routeData({ error: !login.ok ? login.error : "Two-factor verification required" });
  },
});
