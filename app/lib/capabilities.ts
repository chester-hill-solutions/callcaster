/**
 * Stable product capability IDs for SEC-07 session/API-key authorization.
 * Route guards and API-key scopes reference these IDs; do not rename without
 * a migration plan.
 *
 * Keep this module free of server-only package imports — UI may import it.
 */
export const PRODUCT_CAPABILITIES = {
  "campaigns.read":
    "Read campaigns, queue, contacts, audiences, scripts, surveys, conversations, and workspace metadata",
  "campaigns.write":
    "Create and update campaigns, mutate queues, and delete contacts",
  "campaigns.dispatch": "Dispatch campaign SMS batches (/api/sms)",
  "calls.start": "Start dialer conferences and outbound call sessions",
  "calls.control": "Control live calls (disconnect, hold, transfer)",
  "messages.send": "Send direct chat SMS (/api/chat_sms)",
  "members.invite": "Invite and manage workspace members",
  "audit.read": "Read workspace audit events",
} as const;

export type ProductCapabilityId = keyof typeof PRODUCT_CAPABILITIES;

export function isProductCapabilityId(value: string): value is ProductCapabilityId {
  return value in PRODUCT_CAPABILITIES;
}

/** Cutover roles — mirrors @chester-hill-solutions/auth-postgres PRODUCT_ROLE_IDS. */
export const PRODUCT_ROLE_IDS = ["owner", "admin", "member", "caller"] as const;
export type ProductRoleId = (typeof PRODUCT_ROLE_IDS)[number];

export type RoleCapabilitySeed = {
  roleId: ProductRoleId;
  capabilityIds: readonly string[];
};

const ALL_CAPABILITY_IDS = Object.keys(PRODUCT_CAPABILITIES) as ProductCapabilityId[];

/**
 * In-app role→capability matrix until CHS `workspace_feature_permission` tables
 * are cut over. Shape matches `seedProductRoleCapabilityMatrix`.
 *
 * Policy notes:
 * - `audit.read` remains owner-only (matches prior session gate).
 * - Callers get telephony capabilities needed for dialer work.
 * - Empty API-key scopes deny newly gated routes (no grandfather of new powers).
 */
export const CALLCASTER_ROLE_CAPABILITY_MATRIX: readonly RoleCapabilitySeed[] = [
  {
    roleId: "owner",
    capabilityIds: ALL_CAPABILITY_IDS,
  },
  {
    roleId: "admin",
    capabilityIds: [
      "campaigns.read",
      "campaigns.write",
      "campaigns.dispatch",
      "calls.start",
      "calls.control",
      "messages.send",
      "members.invite",
    ],
  },
  {
    roleId: "member",
    capabilityIds: [
      "campaigns.read",
      "campaigns.write",
      "calls.start",
      "calls.control",
      "messages.send",
    ],
  },
  {
    roleId: "caller",
    capabilityIds: ["campaigns.read", "calls.start", "calls.control"],
  },
];

export function isProductRoleId(value: string): value is ProductRoleId {
  return (PRODUCT_ROLE_IDS as readonly string[]).includes(value);
}

export function capabilityIdsForRole(role: string): readonly ProductCapabilityId[] {
  if (!isProductRoleId(role)) {
    return [];
  }
  switch (role) {
    case "owner":
    case "admin":
    case "member":
    case "caller": {
      const row = CALLCASTER_ROLE_CAPABILITY_MATRIX.find((r) => r.roleId === role);
      return (row?.capabilityIds ?? []).filter(isProductCapabilityId);
    }
    default: {
      const _exhaustive: never = role;
      return _exhaustive;
    }
  }
}

/** Default / max API-key TTL (SEC-07). */
export const API_KEY_DEFAULT_TTL_DAYS = 90;
export const API_KEY_MAX_TTL_DAYS = 365;
