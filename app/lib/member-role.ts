/** Workspace member roles (shared by server routes and UI). */
export enum MemberRole {
  Owner = "owner",
  Admin = "admin",
  Member = "member",
  Caller = "caller",
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
  if (!role) return false;
  return (WORKSPACE_ROLE_RANK[role] ?? 0) >= (WORKSPACE_ROLE_RANK[minRole] ?? 0);
}
