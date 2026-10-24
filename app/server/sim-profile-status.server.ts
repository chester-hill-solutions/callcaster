import { and, eq, isNull } from "drizzle-orm";
import { authUser } from "@/db/auth-schema";
import { user, workspace, workspace_member } from "@/db/schema";
import {
  checkSimProfileAccess,
  getSimProfileStatus,
  type SimProfileAccessResult,
  type SimProfileStatusResult,
  type SimProfileStatusRepository,
} from "@/lib/sim-profile-status.server";
import type { ResolvedSimProfile } from "../../e2e/sim/personas";

async function createRepository(): Promise<SimProfileStatusRepository> {
  const [{ db }] = await Promise.all([import("@/server/db")]);
  return {
    findUsersByEmail: async (email) => db.select({ id: authUser.id, email: authUser.email, simMarker: authUser.simMarker }).from(authUser).where(eq(authUser.email, email)),
    findApplicationUserById: async (userId) => {
      const [row] = await db.select({ id: user.id, simMarker: user.sim_marker }).from(user).where(eq(user.id, userId));
      return row ?? null;
    },
    findWorkspacesByNameAndMarker: async (name, marker) => db.select({ id: workspace.id, name: workspace.name, simMarker: workspace.sim_marker }).from(workspace).where(and(eq(workspace.name, name), eq(workspace.sim_marker, marker))),
    findUnmarkedWorkspacesByName: async (name) => db.select({ id: workspace.id, name: workspace.name, simMarker: workspace.sim_marker }).from(workspace).where(and(eq(workspace.name, name), isNull(workspace.sim_marker))),
    findMembership: async (workspaceId, userId) => {
      const [row] = await db.select({ role: workspace_member.role_id, marker: workspace_member.sim_marker }).from(workspace_member).where(and(eq(workspace_member.workspace_id, workspaceId), eq(workspace_member.user_id, userId)));
      return row ?? null;
    },
  };
}

export async function getSimProfileStatusInDatabase(profile: ResolvedSimProfile): Promise<SimProfileStatusResult> {
  if ((profile.environment as string) === "production") throw new Error("SIM profile status is not allowed for production");
  return getSimProfileStatus(profile, await createRepository());
}

export async function checkSimProfileAccessInDatabase(profile: ResolvedSimProfile, capability: string, flow?: string): Promise<SimProfileAccessResult> {
  if ((profile.environment as string) === "production") throw new Error("SIM profile status is not allowed for production");
  return checkSimProfileAccess(profile, await createRepository(), capability, flow);
}
