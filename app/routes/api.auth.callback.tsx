import { redirect, type LoaderFunctionArgs } from "@remix-run/node";
import { createServerClient, parse, serialize } from "@supabase/ssr";
import { type EmailOtpType } from "@supabase/supabase-js";
import { Database } from "~/lib/database.types";

export async function loader({ request }: LoaderFunctionArgs) {
  const requestUrl = new URL(request.url);
  const token_hash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type") as EmailOtpType | null;
  const next = requestUrl.searchParams.get("next") || "/";
  const headers = new Headers();
  const cookies = parse(request.headers.get("Cookie") ?? "");

  if (token_hash && type) {
    const supabase = createServerClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_ANON_KEY!,
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
    console.error(error)
  }
  return redirect("/auth/auth-code-error", { headers });
}
