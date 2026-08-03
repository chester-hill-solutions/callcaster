/**
 * Constrain a caller-supplied `?next=` to a path on this origin.
 *
 * Post-authentication redirects are the dangerous case: the response that
 * follows a sign-in, a 2FA verification, or an email-verification callback also
 * carries freshly-set session cookies, so sending the browser off-site there
 * hands an attacker a landing page that looks like it came from us.
 *
 * Rejected, in order of how easily each is missed:
 *   - absolute URLs (`https://evil.example`) — no leading slash
 *   - protocol-relative URLs (`//evil.example`) — a leading slash, and the one
 *     that slipped past the sign-in and 2FA handlers
 *   - backslash variants (`/\evil.example`), which some browsers fold to `//`
 *
 * `disallowPrefixes` covers loops, e.g. bouncing sign-in back to itself.
 */
export function getSafeRedirectPath(
  next: string | null | undefined,
  options: { fallback?: string; disallowPrefixes?: string[] } = {},
): string {
  const fallback = options.fallback ?? "/";
  if (!next || !next.startsWith("/")) return fallback;
  if (next.startsWith("//") || next.startsWith("/\\")) return fallback;
  if (options.disallowPrefixes?.some((prefix) => next.startsWith(prefix))) {
    return fallback;
  }
  return next;
}
