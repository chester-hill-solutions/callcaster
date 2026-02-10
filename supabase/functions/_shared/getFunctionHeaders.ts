/**
 * Returns headers for calling other Edge Functions (queue-next, ivr-handler, sms-handler).
 * Requires EDGE_FUNCTION_JWT to be the legacy JWT service-role key (not sb_secret_*).
 * Edge runtime must have this secret set in Supabase (dashboard or `supabase secrets set`).
 * Note: Supabase reserves the SUPABASE_ prefix for built-in env vars, so use EDGE_FUNCTION_JWT.
 */
function isJwtShaped(value: string): boolean {
  if (!value || typeof value !== "string") return false;
  const parts = value.trim().split(".");
  return parts.length === 3 && parts.every((p) => p.length > 0);
}

export function getFunctionHeaders(): {
  Authorization: string;
  "Content-Type": string;
  apikey: string;
} {
  const key = Deno.env.get("EDGE_FUNCTION_JWT");
  if (!key) {
    throw new Error(
      "EDGE_FUNCTION_JWT is not set. Set it to the legacy JWT service-role key for Edge Function-to-Edge Function calls."
    );
  }
  if (!isJwtShaped(key)) {
    const hint = key.trimStart().startsWith("sb_")
      ? " You appear to have set a secret/publishable key (sb_*). Use the legacy JWT instead: Dashboard → Project Settings → API → Legacy API Keys → copy the service_role value (starts with eyJ)."
      : " Use the legacy JWT from Dashboard → Project Settings → API → Legacy API Keys → service_role (a long token with two dots, starting with eyJ).";
    throw new Error(
      "EDGE_FUNCTION_JWT must be the legacy JWT service-role key (three dot-separated segments)." + hint
    );
  }
  return {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    apikey: key,
  };
}
