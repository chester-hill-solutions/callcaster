/**
 * Convert an unknown thrown value into a safe, user-facing message.
 *
 * Intent: our own code throws intentional, human-readable errors
 * ("Campaign name is required"). Infrastructure errors (Supabase/Postgres,
 * fetch failures, type errors) leak internals and confuse users. This helper
 * passes through the former and replaces the latter with a caller-supplied
 * fallback. Use `getErrorDetail` to log the raw message server-side.
 */

/** Substrings that mark a message as technical/internal, never user-facing. */
const TECHNICAL_MARKERS = [
  "supabase",
  "fetch failed",
  "typeerror",
  "referenceerror",
  "syntaxerror",
  "pgrst",
  "duplicate key",
  "violates",
  "econn",
  "etimedout",
  "enotfound",
  "undefined",
  "null",
  "{",
  "\n    at ", // stack frame
  // Connection/pool/socket failures read as capitalized plain English and
  // otherwise slip through (e.g. "Connection terminated unexpectedly").
  "connection terminated",
  "connection reset",
  "connection closed",
  "terminated unexpectedly",
  "socket hang up",
  "epipe",
  "the pool",
  "timeout exceeded",
  "query read timeout",
];

function isLikelyUserFacing(message: string): boolean {
  if (!message || message.length >= 140) return false;
  if (!/^[A-Z]/.test(message)) return false;
  const lower = message.toLowerCase();
  return !TECHNICAL_MARKERS.some((marker) => lower.includes(marker));
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
