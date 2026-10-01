import {
  checkRateLimit,
  rateLimitResponse,
  type RateLimitResult,
} from "@/lib/platform-rate-limit.server";
import type {
  ApiKeyAuthResult,
  BearerSessionAuthResult,
  SessionAuthResult,
} from "@/lib/api-auth.server";

/**
 * Per-key rate limiting for the public write API (#2135).
 *
 * ## Why the bucket is the credential, not the IP
 *
 * `clientRateLimitKey` derives the key from `x-forwarded-for`, which a caller
 * controls. It is the right bucket for a *public form* — there the IP is the
 * only identity available — and the wrong one here: every route in this module
 * already resolved an authenticated principal, and a leaked key is precisely
 * the case an IP bucket does not stop, because the attacker rotates the header
 * and the legitimate integrator never notices.
 *
 * So the bucket is the API key's row id, falling back to the user's id for
 * session and bearer callers. Neither is attacker-controlled, and both are
 * stable across the IPs a single integrator might use.
 *
 * ## Why these ceilings
 *
 * Every one is an order of magnitude above what any legitimate caller needs,
 * because the failure mode of a wrong ceiling is an integrator's production
 * integration breaking at the worst moment, while the failure mode of a missing
 * one is the thing this issue describes: a key driven at full speed until the
 * credits are gone. Where a route does real work per request — a campaign batch
 * dispatch, a Twilio provisioning call, a body-buffered upload — the ceiling is
 * lower, because the resource being consumed is not the request.
 *
 * They are per minute and per credential, not per workspace, so a workspace
 * running several keys is not throttled by a colleague's traffic.
 */
export type ApiWriteScope =
  /** POST /api/sms — dispatches a whole campaign batch and debits credits. */
  | "api-sms"
  /** POST /api/chat_sms — one billable SMS to an arbitrary number. */
  | "api-chat-sms"
  /** POST /api/campaigns/create-with-script — provisions Twilio resources. */
  | "api-create-with-script"
  /** POST /api/media — object-storage upload, and the body is buffered first. */
  | "api-media"
  /** POST /api/contacts — bulk create. */
  | "api-contacts-bulk";

/**
 * Per-minute ceilings. See "Why these ceilings" above for the reasoning; keep
 * that reasoning in step with any change here.
 */
export const API_WRITE_LIMITS: Record<ApiWriteScope, { limit: number; windowMs: number }> = {
  // A single request fans out into a full campaign's worth of sends, so the
  // per-request count is low even though the per-request cost is high.
  "api-sms": { limit: 30, windowMs: 60_000 },
  // Cheapest request to serve and the one most likely to be looped by a
  // mis-written integration, so the highest ceiling of the money-spending set.
  "api-chat-sms": { limit: 120, windowMs: 60_000 },
  // Provisions Twilio numbers and a campaign. Nobody legitimately does this
  // faster than a handful a minute.
  "api-create-with-script": { limit: 10, windowMs: 60_000 },
  // `request.formData()` buffers the entire upload before any of this runs, so
  // the ceiling is on storage, not on requests.
  "api-media": { limit: 30, windowMs: 60_000 },
  // Bulk create is one request per batch; a real import is tens of batches.
  "api-contacts-bulk": { limit: 30, windowMs: 60_000 },
};

export type DualAuthResult =
  | ApiKeyAuthResult
  | BearerSessionAuthResult
  | SessionAuthResult;

/**
 * The bucket identity for an authenticated caller: the API key's row id, or the
 * user's id for a session/bearer caller. Returns `null` only for a shape this
 * module was not handed, which callers treat as "do not throttle" — a missing
 * principal is an auth bug, not a reason to hand out free unlimited writes.
 */
export function apiRateLimitPrincipal(auth: unknown): string | null {
  if (!auth || typeof auth !== "object") return null;
  const candidate = auth as Partial<ApiKeyAuthResult> & {
    user?: { id?: unknown };
  };
  if (candidate.authType === "api_key") {
    return typeof candidate.keyId === "string" && candidate.keyId ? candidate.keyId : null;
  }
  const userId = candidate.user?.id;
  return typeof userId === "string" && userId ? userId : null;
}

/** Bucket key. Scoped so two endpoints cannot share a budget. */
export function apiRateLimitKey(principal: string, scope: ApiWriteScope): string {
  return `api-write:${scope}:${principal}`;
}

export function checkApiWriteRateLimit(
  auth: unknown,
  scope: ApiWriteScope,
): Promise<RateLimitResult> {
  const principal = apiRateLimitPrincipal(auth);
  // No resolvable principal means the auth layer gave us something unexpected.
  // Let the request through rather than 429 it: the route's own auth and
  // capability checks still apply, and a throttle here would mask the real bug.
  if (!principal) {
    return Promise.resolve({ ok: true, remaining: -1, resetAt: 0 });
  }
  return checkRateLimit({ key: apiRateLimitKey(principal, scope), ...API_WRITE_LIMITS[scope] });
}

/**
 * Convenience wrapper: returns a 429 `Response` when the caller is over its
 * ceiling, or `null` to carry on. `rateLimitResponse` sets `Retry-After` and the
 * `rate_limited` code, so an integrator can self-diagnose from the response
 * alone.
 */
export async function apiWriteRateLimitResponse(
  auth: unknown,
  scope: ApiWriteScope,
): Promise<Response | null> {
  const result = await checkApiWriteRateLimit(auth, scope);
  if (result.ok) return null;
  return rateLimitResponse(result.retryAfterSeconds);
}