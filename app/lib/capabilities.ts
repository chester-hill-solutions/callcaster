/**
 * Stable product capability IDs for SEC-07 session/API-key authorization.
 * Route guards and API-key scopes will reference these IDs once CHS auth
 * feature permissions are adopted; do not rename without a migration plan.
 */
export const PRODUCT_CAPABILITIES = {
  "campaigns.read": "Read campaigns and queue state",
  "campaigns.write": "Create and update campaigns",
  "campaigns.dispatch": "Activate automated campaign dispatch",
  "calls.start": "Start dialer conferences and outbound call sessions",
  "calls.control": "Control live calls (disconnect, hold, transfer)",
  "messages.send": "Send SMS and chat messages",
  "members.invite": "Invite and manage workspace members",
  "audit.read": "Read workspace audit events",
} as const;

export type ProductCapabilityId = keyof typeof PRODUCT_CAPABILITIES;

export function isProductCapabilityId(value: string): value is ProductCapabilityId {
  return value in PRODUCT_CAPABILITIES;
}
