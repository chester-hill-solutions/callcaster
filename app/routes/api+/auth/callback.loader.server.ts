import { env } from "@/lib/env.server";
import { logger } from "@/lib/logger.server";
import { redirect } from "react-router";
import { auth } from "@/server/auth-instance";
import { mergeBetterAuthSetCookieHeaders } from "@/lib/better-auth-headers.server";
import type { LoaderFunctionArgs } from "react-router";

function getSafeRedirectPath(next: string | null): string {
  if (!next || !next.startsWith("/")) {
    return "/";
  }

  return next.startsWith("//") ? "/" : next;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const requestUrl = new URL(request.url);
  const token_hash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type");
  const next = getSafeRedirectPath(requestUrl.searchParams.get("next"));

  if (token_hash && type) {
    try {
      const result = await auth.api.verifyEmail({
        query: { token: token_hash },
        headers: request.headers,
        returnHeaders: true,
      });
      const headers = mergeBetterAuthSetCookieHeaders(result?.headers);
      const payload = result?.response ?? result;

      if (payload?.user) {
        return redirect(next, { headers });
      }
    } catch (error) {
      logger.error("Auth callback error:", error);
    }
  }

  return redirect("/auth/auth-code-error");
}
