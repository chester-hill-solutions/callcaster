import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { isSignupOpen } from "@/lib/env.server";
import { jsonError } from "@/lib/platform-api.server";
import { auth } from "@/server/auth-instance";

function isBetterAuthSignUpPath(request: Request): boolean {
  const { pathname } = new URL(request.url);
  return pathname.includes("/sign-up");
}

async function handleAuthRequest(request: Request) {
  if (!isSignupOpen() && isBetterAuthSignUpPath(request)) {
    return jsonError("Registration is closed.", 403);
  }
  return auth.handler(request);
}

export async function loader({ request }: LoaderFunctionArgs) {
  return handleAuthRequest(request);
}

export async function action({ request }: ActionFunctionArgs) {
  return handleAuthRequest(request);
}
