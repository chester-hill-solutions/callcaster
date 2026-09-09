import { logger } from "@/lib/logger.server";
import { redirect } from "react-router";
import { auth } from "@/server/auth-instance";
import { getSafeRedirectPath } from "@/lib/safe-redirect";
import { defineLoader } from "@/lib/handler.server";
import { mergeBetterAuthSetCookieHeaders } from "@/lib/better-auth-headers.server";

export const loader = defineLoader({
  sideEffects: ["db-write"],
  handler: async ({ request, url }) => {
    const token_hash = url.searchParams.get("token_hash");
    const type = url.searchParams.get("type");
    const next = getSafeRedirectPath(url.searchParams.get("next"));

    if (token_hash && type) {
      try {
        const result = (await auth.api.verifyEmail({
          query: { token: token_hash },
          headers: request.headers,
          returnHeaders: true,
        })) as { response?: { user?: unknown }; headers?: Headers };
        const headers = mergeBetterAuthSetCookieHeaders(result?.headers);

        if (result?.response?.user) {
          return redirect(next, { headers });
        }
      } catch (error) {
        logger.error("Auth callback error:", error);
      }
    }

    return redirect("/auth/auth-code-error");
  },
});
