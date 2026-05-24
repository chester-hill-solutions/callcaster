import { env } from "@/lib/env.server";
import { redirect, type LoaderFunctionArgs } from "react-router";
import { createServerClient, parse, serialize } from "@supabase/ssr";
import type { EmailOtpType } from "@supabase/supabase-js";

export async function loader({ request }: LoaderFunctionArgs) {
    const requestUrl = new URL(request.url);
    const token_hash = requestUrl.searchParams.get('token_hash');
    const type = requestUrl.searchParams.get('type');
    const next = requestUrl.searchParams.get('next') || '/';
    const headers = new Headers();

    if (token_hash && type) {
        const cookies = parse(request.headers.get('Cookie') ?? '')

        const supabase = createServerClient(env.SUPABASE_URL(), env.SUPABASE_ANON_KEY(), {
            cookies: {
                get(key) {
                    return cookies[key]
                },
                set(key, value, options) {
                    headers.append('Set-Cookie', serialize(key, value, options))
                },
                remove(key, options) {
                    headers.append('Set-Cookie', serialize(key, '', options))
                },
            },
        })

        const { error } = await supabase.auth.verifyOtp({
            type: type as EmailOtpType,
            token_hash,
        })

        if (!error) {
            return redirect(next, { headers })
        }
    }
    
    return redirect('/auth/auth-code-error', { headers })
}