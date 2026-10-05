import { MemberRole } from "@/lib/member-role";
import type { User } from "@/lib/types";

export type WorkspaceMemberDisplay = Pick<
  NonNullable<User>,
  "id" | "username" | "first_name" | "last_name"
> & { role: string };

type MemberWithRole = { role: string };

export function compareMembersByRole<T extends MemberWithRole>(a: T, b: T) {
  const memberRoleArray = Object.values(MemberRole);

  const aRole = a.role as MemberRole;
  const bRole = b.role as MemberRole;

  if (memberRoleArray.indexOf(aRole) < memberRoleArray.indexOf(bRole)) {
    return -1;
  }
  if (memberRoleArray.indexOf(aRole) > memberRoleArray.indexOf(bRole)) {
    return 1;
  }
  return 0;
}

export function normalizeSchedule(schedule: unknown) {
  if (!schedule) return null;

  if (typeof schedule === "string") {
    try {
      return JSON.parse(schedule);
    } catch {
      return null;
    }
  }

  return schedule;
}
