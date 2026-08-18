/**
 * Convert an unknown thrown value into a safe, user-facing message.
 *
 * Intent: our own code throws intentional, human-readable errors
 * ("Campaign name is required"). Infrastructure errors (Postgres,
 * fetch failures, type errors) leak internals and confuse users. This helper
 * passes through the former and replaces the latter with a caller-supplied
 * fallback. Use `getErrorDetail` to log the raw message server-side.
 *
 * The implementation uses an allowlist-first approach:
 * 1. The message must look like intentional product copy (sentence-like).
 * 2. A compact deny list catches known infra patterns that happen to look
 *    like English (e.g. "Connection terminated unexpectedly").
 * 3. Default is fallback — only intentional copy and known border cases pass.
 */

const ALLOW_SENTENCE_RE = /^[A-Z][A-Za-z0-9 '(),./:;!?-]{0,138}[.!]?$/;

const INFRA_DENY = /econn|pgrst|duplicate key|typeerror|referenceerror|syntaxerror|fetch failed|supabase|connection (terminated|reset|closed)|timeout exceeded|query read timeout|terminated unexpectedly|socket hang|epipe|the pool/i;

function isLikelyUserFacing(message: string): boolean {
  if (!message || message.length >= 140) return false;
  if (!ALLOW_SENTENCE_RE.test(message)) return false;
  return !INFRA_DENY.test(message);
}

/**
 * Returns `error`'s message if it looks like an intentional user-facing
 * message thrown by our own code; otherwise returns `fallback`.
 * Never returns raw internals from unknown sources.
 */
export function toUserMessage(error: unknown, fallback: string): string {
  let message: string | null = null;

  if (typeof error === "string") {
    message = error;
  } else if (error instanceof Error) {
    message = error.message;
  }

  if (message !== null && isLikelyUserFacing(message.trim())) {
    return message.trim();
  }

  return fallback;
}

/**
 * Extracts the raw message from an unknown error for logging/diagnostics.
 * Do NOT show this to users — use `toUserMessage` for that.
 */
export function getErrorDetail(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  try {
    return JSON.stringify(error) ?? String(error);
  } catch {
    return String(error);
  }
}
