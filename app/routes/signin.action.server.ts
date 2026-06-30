import { getSession } from "@/lib/auth.server";
import { loginWithPassword } from "@/lib/platform-auth.server";
import { mergeBetterAuthSetCookieHeaders } from "@/lib/better-auth-headers.server";
import { data as routeData, redirect } from "react-router";
import { logger } from "@/lib/logger.server";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { user, headers } = await getSession(request);

  if (user) {
    return redirect("/workspaces", { headers });
  }
  return routeData({ user: null }, { headers });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const requestUrl = new URL(request.url);
  const next = requestUrl.searchParams.get("next");

  const formData = await request.formData();
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const login = await loginWithPassword(request, email, password);

  if (login.ok) {
    const headers = mergeBetterAuthSetCookieHeaders(login.headers);
    if (next && next.startsWith("/") && !next.startsWith("/signin")) {
      return redirect(next, { headers });
    }
    return redirect("/workspaces", { headers });
  }
  logger.error("Sign-in error", login.error);
  return routeData({ error: login.error });
};
