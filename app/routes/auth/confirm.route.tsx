import { redirect, type LoaderFunctionArgs } from "react-router";
import { auth } from "@/server/auth-instance";
import { mergeBetterAuthSetCookieHeaders } from "@/lib/better-auth-headers.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const requestUrl = new URL(request.url);
  const token_hash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type");
  const next = requestUrl.searchParams.get("next") || "/";

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
    } catch {
      // fall through to error redirect
    }
  }

  return redirect("/auth/auth-code-error");
}
