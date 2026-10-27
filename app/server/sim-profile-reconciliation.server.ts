import { and, eq, sql } from "drizzle-orm";
import { authUser } from "@/db/auth-schema";
import { user, workspace, workspace_audit_event, workspace_member } from "@/db/schema";
import { reconcileSimProfile, SimReconciliationError, type SimReconciliationResult } from "@/lib/sim-profile-reconciliation.server";
import type { ResolvedSimProfile } from "../../e2e/sim/personas";

export async function reconcileSimProfileInDatabase(profile: ResolvedSimProfile): Promise<SimReconciliationResult> {
  if ((profile.environment as string) === "production") {
    throw new SimReconciliationError("blocked", "SIM reconciliation is not allowed for production");
  }
  const [{ db }] = await Promise.all([import("@/server/db")]);
  return reconcileSimProfile(profile, (fn) => db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${profile.workspaceName}:${profile.workspaceMarker}`}))`);
    return fn({
      findUsers: async (email) => tx.select({ id: authUser.id, email: authUser.email, simMarker: authUser.simMarker }).from(authUser).where(eq(authUser.email, email)),
      createUser: async ({ id, email, marker }) => {
        await tx.insert(authUser).values({ id, name: email, email, emailVerified: true, simMarker: marker });
        await tx.insert(user).values({ id, username: email, access_level: "standard", sim_marker: marker });
      },
      findWorkspaces: async (name, marker) => tx.select({ id: workspace.id, name: workspace.name, simMarker: workspace.sim_marker }).from(workspace).where(marker ? and(eq(workspace.name, name), eq(workspace.sim_marker, marker)) : eq(workspace.name, name)),
      createWorkspace: async ({ id, name, marker }) => { await tx.insert(workspace).values({ id, name, sim_marker: marker, credits: 0, twilio_data: "{}" }); },
      findMembership: async (workspaceId, userId) => { const [row] = await tx.select({ role: workspace_member.role_id, marker: workspace_member.sim_marker }).from(workspace_member).where(and(eq(workspace_member.workspace_id, workspaceId), eq(workspace_member.user_id, userId))); return row ?? null; },
      countOwners: async (workspaceId) => (await tx.select({ id: workspace_member.id }).from(workspace_member).where(and(eq(workspace_member.workspace_id, workspaceId), eq(workspace_member.role_id, "owner")))).length,
      createMembership: async ({ workspaceId, userId, role, marker }) => { await tx.insert(workspace_member).values({ id: `wm:${workspaceId}:${userId}`, workspace_id: workspaceId, user_id: userId, role_id: role, sim_marker: marker }); },
      updateMembership: async (workspaceId, userId, role) => { await tx.update(workspace_member).set({ role_id: role }).where(and(eq(workspace_member.workspace_id, workspaceId), eq(workspace_member.user_id, userId))); },
      audit: async (workspaceId, action, metadata) => { await tx.insert(workspace_audit_event).values({ workspace_id: workspaceId, created_at: new Date().toISOString(), actor_type: "system", action, outcome: "success", metadata }); },
    });
  }));
}
