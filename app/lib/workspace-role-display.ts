import { MemberRole } from "@/lib/member-role";

export type WorkspaceRoleDisplayName =
  | "Agent"
  | "Coordinator"
  | "Administrator";

export const WORKSPACE_ROLE_DISPLAY_NAMES = {
  [MemberRole.Owner]: "Administrator",
  [MemberRole.Admin]: "Administrator",
  [MemberRole.Member]: "Coordinator",
  [MemberRole.Caller]: "Agent",
} as const satisfies Record<MemberRole, WorkspaceRoleDisplayName>;

export function isWorkspaceMemberRole(role: string): role is MemberRole {
  return Object.values(MemberRole).includes(role as MemberRole);
}

export function getWorkspaceRoleDisplayName(
  role: MemberRole,
): WorkspaceRoleDisplayName {
  return WORKSPACE_ROLE_DISPLAY_NAMES[role];
}
