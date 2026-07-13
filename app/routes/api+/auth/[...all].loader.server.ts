import { isSignupOpen } from "@/lib/env.server";
import { jsonError } from "@/lib/platform-api.server";
import { defineAction, defineLoader } from "@/lib/handler.server";
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

export const loader = defineLoader({
  sideEffects: ["db-write", "external"],
  handler: ({ request, url }) => handleAuthRequest(request, url),
});

export const action = defineAction({
  sideEffects: ["db-write", "external"],
  handler: ({ request, url }) => handleAuthRequest(request, url),
});
