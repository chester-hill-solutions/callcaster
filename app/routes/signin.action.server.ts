import { loginWithPassword } from "@/lib/platform-auth.server";
import { mergeBetterAuthSetCookieHeaders } from "@/lib/better-auth-headers.server";
import { data as routeData, redirect } from "react-router";
import { logger } from "@/lib/logger.server";
import { defineAction } from "@/lib/handler.server";

export const action = defineAction({
  sideEffects: ["db-write"],
  handler: async ({ request, url }) => {
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
      if (next && next.startsWith("/") && !next.startsWith("/signin")) {
        return redirect(next, { headers });
      }
      return redirect("/workspaces", { headers });
    }
    logger.error("Sign-in error", !login.ok ? login.error : "Two-factor required");
    return routeData({ error: !login.ok ? login.error : "Two-factor verification required" });
  },
});
