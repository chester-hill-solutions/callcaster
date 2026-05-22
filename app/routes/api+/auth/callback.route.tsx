import { redirect, type LoaderFunctionArgs } from "react-router";
import { createServerClient, parse, serialize } from "@supabase/ssr";
import { type EmailOtpType } from "@supabase/supabase-js";
import { Database } from "@/lib/database.types";


function getSafeRedirectPath(next: string | null): string {
  if (!next || !next.startsWith("/")) {
    return "/";
  }

  return next.startsWith("//") ? "/" : next;
}

export async function loader({ request }: LoaderFunctionArgs) {  const { logger } = await import("@/lib/logger.server");
  const { env } = await import("@/lib/env.server");

  const requestUrl = new URL(request.url);
  const token_hash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type") as EmailOtpType | null;
  const next = getSafeRedirectPath(requestUrl.searchParams.get("next"));
  const headers = new Headers();
  const cookies = parse(request.headers.get("Cookie") ?? "");

  if (token_hash && type) {
    const supabase = createServerClient<Database>(
      env.SUPABASE_URL(),
      env.SUPABASE_ANON_KEY(),
      {
        cookies: {
          get(key) {
            return cookies[key];
          },
          set(key, value, options) {
            headers.append("Set-Cookie", serialize(key, value, options));
          },
          remove(key, options) {
            headers.append("Set-Cookie", serialize(key, "", options));
          },
        },
      },
    );

    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash,
    });

    if (!error) {
      return redirect(next, { headers });
    }
    logger.error('Auth callback error:', error);
  }
  return redirect("/auth/auth-code-error", { headers });
}
