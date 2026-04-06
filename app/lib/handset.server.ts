/** Inactivity timeout: handset session expires this many minutes after last call activity. */
export const INACTIVITY_TIMEOUT_MINUTES = 15;

export function extendHandsetSessionExpiry(): string {
  return new Date(
    Date.now() + INACTIVITY_TIMEOUT_MINUTES * 60 * 1000
  ).toISOString();
}
