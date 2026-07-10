import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { isSignupOpen } from "@/lib/env.server";
import { jsonError } from "@/lib/platform-api.server";
import { auth } from "@/server/auth-instance";

function isBetterAuthSignUpPath(url: URL): boolean {
  return url.pathname.includes("/sign-up");
}

async function handleAuthRequest(request: Request, url: URL) {
  if (!isSignupOpen() && isBetterAuthSignUpPath(url)) {
    return jsonError("Registration is closed.", 403);
  }
  return auth.handler(request);
}

export async function loader({ request, url }: LoaderFunctionArgs) {
  return handleAuthRequest(request, url);
}

export async function action({ request, url }: ActionFunctionArgs) {
  return handleAuthRequest(request, url);
}
