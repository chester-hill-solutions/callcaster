/** Workspace member roles (shared by server routes and UI). */
export enum MemberRole {
  Owner = "owner",
  Admin = "admin",
  Member = "member",
  Caller = "caller",
}

const MEMBER_ROLE_VALUES: ReadonlySet<string> = new Set(Object.values(MemberRole));

/** True when `value` is one of the four workspace roles. */
export function isMemberRole(value: unknown): value is MemberRole {
  return typeof value === "string" && MEMBER_ROLE_VALUES.has(value);
}

/** Numeric ranks for min-role gates (owner highest). */
export const WORKSPACE_ROLE_RANK: Record<string, number> = {
  owner: 4,
  admin: 3,
  member: 2,
  caller: 1,
};

export function hasMinRole(
  role: string | undefined,
  minRole: string | undefined,
): boolean {
  if (!minRole) return true;
  // Fail closed on an unrecognized gate (e.g. a typo'd or renamed constant):
  // an unknown minRole must DENY, not silently authorize everyone.
  const minRank = WORKSPACE_ROLE_RANK[minRole];
  if (minRank === undefined) return false;
  if (!role) return false;
  return (WORKSPACE_ROLE_RANK[role] ?? 0) >= minRank;
}
