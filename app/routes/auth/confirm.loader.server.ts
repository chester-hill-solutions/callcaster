import { redirect } from "react-router";
import { auth } from "@/server/auth-instance";
import { getSafeRedirectPath } from "@/lib/safe-redirect";
import { mergeBetterAuthSetCookieHeaders } from "@/lib/better-auth-headers.server";
import { defineLoader } from "@/lib/handler.server";

export const loader = defineLoader({
  sideEffects: ["db-write"],
  handler: async ({ request, url }) => {
    const token_hash = url.searchParams.get("token_hash");
    const type = url.searchParams.get("type");
    // Unvalidated before: this response carries the session cookies set by
    // verifyEmail, so an absolute ?next handed those to another origin.
    const next = getSafeRedirectPath(url.searchParams.get("next"));

    if (token_hash && type) {
      try {
        const result = await auth.api.verifyEmail({
          query: { token: token_hash },
          headers: request.headers,
          returnHeaders: true,
        });
        const headers = mergeBetterAuthSetCookieHeaders(result?.headers);
        const payload = result?.response ?? result;

        if ((payload as { user?: unknown })?.user) {
          return redirect(next, { headers });
        }
      } catch {
        // fall through to error redirect
      }
    }

    return redirect("/auth/auth-code-error");
  },
});
