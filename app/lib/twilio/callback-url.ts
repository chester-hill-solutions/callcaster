/** Compare signed URL values while preserving query multiplicity and meaning. */
export function matchesStoredVoiceCallbackUrl(actual: string, saved: string | null | undefined) {
  if (!saved) return false;
  const received = new URL(actual), reserved = new URL(saved);
  const entries = (url: URL) => JSON.stringify([...url.searchParams.entries()].map((entry) => JSON.stringify(entry)).sort());
  return received.origin === reserved.origin && received.pathname === reserved.pathname &&
    received.username === reserved.username && received.password === reserved.password && received.hash === reserved.hash &&
    entries(received) === entries(reserved);
}
