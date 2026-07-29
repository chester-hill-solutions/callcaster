import { isSignupOpen } from "@/lib/env.server";
import { jsonError } from "@/lib/platform-api.server";
import { defineAction, defineLoader } from "@/lib/handler.server";
import { enforceAuthRateLimit } from "@/lib/platform-auth-rate-limit.server";
import { auth } from "@/server/auth-instance";

function isBetterAuthSignUpPath(url: URL): boolean {
  return url.pathname.includes("/sign-up");
}

/** Credential/TOTP guessing surfaces get the strict bucket; other POSTs the loose one. */
function rateLimitScopeForAuthPath(url: URL): "auth:sign-in" | "auth:catch-all" {
  return url.pathname.includes("/sign-in") || url.pathname.includes("/two-factor")
    ? "auth:sign-in"
    : "auth:catch-all";
}

async function handleAuthRequest(request: Request, url: URL) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    const limited = await enforceAuthRateLimit(
      request,
      rateLimitScopeForAuthPath(url),
    );
    if (limited) return limited;
  }
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
