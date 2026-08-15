/**
 * Outbound credit gate: the single owner of the balance read, the
 * unknown-workspace distinction, and the locked 402 blocked shape for every
 * outbound voice/SMS entry point.
 *
 * `requireOutboundCredits` returns a plain discriminated result — no HTTP
 * here — so service-layer callers (`auto-dial-start.server.ts`,
 * `campaign-sms-dispatch.server.ts`) can consume it without an HTTP shape
 * leaking into non-route code. Route callers map the result to a Response
 * with `outboundCreditsResponse` (workspace_not_found -> uniform 404,
 * matching `requireWorkspaceAccess`'s workspace-probe-resistance
 * convention, ADR-0004) or `outboundCreditsBlockedResponse` (fail-closed:
 * treat an unknown workspace the same as insufficient credits — for sites
 * where workspace existence is already guaranteed by an earlier
 * `requireWorkspaceAccess` / capability check, so the distinction would
 * only matter under a TOCTOU race).
 *
 * See docs/credit-floor-policy.md for product semantics (warn vs block).
 */
import { data as routeData } from "react-router";
import { AppError, ErrorCode } from "@/lib/errors.server";
import { getWorkspaceCreditsBalance } from "@/lib/workspace-credits.server";
import { hasInsufficientCreditsForOutbound } from "../../shared/credit-floor";

/** The one locked blocked-request body shape for every outbound credit 402. */
export const OUTBOUND_CREDITS_BLOCKED_BODY = {
  error: "Insufficient credits",
  creditsError: true,
} as const;

export type OutboundCreditsResult =
  | { ok: true; balance: number }
  | { ok: false; reason: "workspace_not_found" }
  | { ok: false; reason: "insufficient_credits"; balance: number };

export type OutboundCreditsBlocked = Extract<OutboundCreditsResult, { ok: false }>;

/**
 * Read the workspace credit balance and apply the outbound floor policy.
 * Pure result: never throws for a blocked/unknown-workspace outcome, so
 * it is safe to call from both HTTP route handlers and plain service
 * functions.
 */
export async function requireOutboundCredits(
  workspaceId: string,
): Promise<OutboundCreditsResult> {
  const balance = await getWorkspaceCreditsBalance(workspaceId);
  if (balance === null) {
    return { ok: false, reason: "workspace_not_found" };
  }
  if (hasInsufficientCreditsForOutbound(balance)) {
    return { ok: false, reason: "insufficient_credits", balance };
  }
  return { ok: true, balance };
}

/**
 * Route-layer mapping that preserves the unknown-workspace distinction:
 * throws a uniform 404 AppError (same shape `requireWorkspaceAccess`
 * produces) for `workspace_not_found`, otherwise returns the locked 402
 * blocked body. Use at sites that don't already run a workspace-existence
 * check ahead of the credit gate.
 */
export function outboundCreditsResponse(
  result: OutboundCreditsBlocked,
  headers?: HeadersInit,
): ReturnType<typeof routeData> {
  if (result.reason === "workspace_not_found") {
    throw new AppError("Workspace not found", 404, ErrorCode.NOT_FOUND);
  }
  return routeData(OUTBOUND_CREDITS_BLOCKED_BODY, { status: 402, headers });
}

/**
 * Route-layer mapping for fail-closed sites: always returns the locked 402
 * blocked body, folding `workspace_not_found` into the same outcome as
 * insufficient credits. Use where an earlier `requireWorkspaceAccess` /
 * capability check already guarantees the workspace exists, so a
 * `workspace_not_found` result here can only be a TOCTOU race and failing
 * closed (rather than surfacing a fresh 404) is the safer default.
 */
export function outboundCreditsBlockedResponse(
  headers?: HeadersInit,
): ReturnType<typeof routeData> {
  return routeData(OUTBOUND_CREDITS_BLOCKED_BODY, { status: 402, headers });
}
