import {
  checkRateLimit,
  rateLimitResponse,
} from "@/lib/platform-rate-limit.server";

export type TwoFactorSetupRateLimitScope = "2fa:enable" | "2fa:verify";

const LIMITS: Record<
  TwoFactorSetupRateLimitScope,
  { limit: number; windowMs: number }
> = {
  "2fa:enable": { limit: 5, windowMs: 15 * 60_000 },
  "2fa:verify": { limit: 10, windowMs: 15 * 60_000 },
};

export async function enforceTwoFactorSetupRateLimit(
  userId: string,
  scope: TwoFactorSetupRateLimitScope,
): Promise<Response | null> {
  const config = LIMITS[scope];
  const result = await checkRateLimit({
    key: `${scope}:${userId}`,
    limit: config.limit,
    windowMs: config.windowMs,
  });
  if (!result.ok) {
    return rateLimitResponse(result.retryAfterSeconds);
  }
  return null;
}
