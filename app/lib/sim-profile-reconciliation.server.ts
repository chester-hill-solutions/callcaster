import { and, eq, sql } from "drizzle-orm";
import { authUser } from "@/db/auth-schema";
import { user, workspace, workspace_audit_event, workspace_member } from "@/db/schema";
import type { ResolvedSimProfile } from "../../e2e/sim/personas";

export type SimReconciliationStatus = "created" | "reused" | "repaired" | "drifted" | "blocked";

export type SimReconciliationResult = Readonly<{
  status: SimReconciliationStatus;
  persona: string;
  environment: string;
  runtimeIdentity: string;
  email: string;
  workspaceMarker: string;
  role: string;
}>;

export class SimReconciliationError extends Error {
  readonly status: SimReconciliationStatus;
  constructor(status: SimReconciliationStatus, message: string) {
    super(message);
    this.name = "SimReconciliationError";
    this.status = status;
  }
}

type ReconcileRepo = {
  findUsers(email: string): Promise<Array<{ id: string; email: string; simMarker: string | null }>>;
  createUser(input: { id: string; email: string; marker: string }): Promise<void>;
  findWorkspaces(name: string, marker: string): Promise<Array<{ id: string; name: string; simMarker: string | null }>>;
  findWorkspacesByMarker(marker: string): Promise<Array<{ id: string; name: string; simMarker: string | null }>>;
  createWorkspace(input: { id: string; name: string; marker: string }): Promise<void>;
  findMembership(workspaceId: string, userId: string): Promise<{ role: string; marker: string | null } | null>;
  countOwners(workspaceId: string): Promise<number>;
  createMembership(input: { workspaceId: string; userId: string; role: string; marker: string }): Promise<void>;
  updateMembership(workspaceId: string, userId: string, role: string): Promise<void>;
  audit(workspaceId: string, action: string, metadata: Record<string, string>): Promise<void>;
};

type ReconcileTransaction = <T>(fn: (repo: ReconcileRepo) => Promise<T>) => Promise<T>;

function roleId(role: string): string {
  if (role === "owner" || role === "admin" || role === "member" || role === "caller") return role;
  throw new SimReconciliationError("blocked", "SIM profile contains an unsupported role");
}

function safeResult(profile: ResolvedSimProfile, status: SimReconciliationStatus): SimReconciliationResult {
  return {
    status,
    persona: profile.personaKey,
    environment: profile.environment,
    runtimeIdentity: profile.runtimeIdentity,
    email: profile.email,
    workspaceMarker: profile.workspaceMarker,
    role: profile.expectedRole,
  };
}

export async function reconcileSimProfile(profile: ResolvedSimProfile, transaction: ReconcileTransaction): Promise<SimReconciliationResult> {
  if ((profile.environment as string) === "production") {
    throw new SimReconciliationError("blocked", "SIM reconciliation is not allowed for production");
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      // The transaction keeps identity, collision, membership, and owner checks atomic.
      // eslint-disable-next-line complexity
      return await transaction(async (repo) => {
      const users = await repo.findUsers(profile.email);
      const userRow = users[0];
      if (users.some((row) => row.simMarker !== profile.workspaceMarker)) {
        throw new SimReconciliationError("blocked", "SIM user identity is owned by another marker");
      }
      const userId = userRow?.id ?? crypto.randomUUID();
      let created = !userRow;
      if (!userRow) {
        await repo.createUser({ id: userId, email: profile.email, marker: profile.workspaceMarker });
      }

      const markedWorkspaces = await repo.findWorkspaces(profile.workspaceName, profile.workspaceMarker);
      const sameName = await repo.findWorkspaces(profile.workspaceName, "");
      const markerWorkspaces = await repo.findWorkspacesByMarker(profile.workspaceMarker);
      if (sameName.some((row) => row.simMarker !== profile.workspaceMarker) ||
          markerWorkspaces.some((row) => row.name !== profile.workspaceName) ||
          markedWorkspaces.length > 1) {
        throw new SimReconciliationError("blocked", "SIM workspace identity collision");
      }
      const workspaceRow = markedWorkspaces[0];
      const workspaceId = workspaceRow?.id ?? crypto.randomUUID();
      if (!workspaceRow) {
        await repo.createWorkspace({ id: workspaceId, name: profile.workspaceName, marker: profile.workspaceMarker });
        created = true;
      }

      const membership = await repo.findMembership(workspaceId, userId);
      let repaired = false;
      if (!membership) {
        await repo.createMembership({ workspaceId, userId, role: profile.expectedRole, marker: profile.workspaceMarker });
        created = true;
      } else if (membership.marker !== profile.workspaceMarker) {
        throw new SimReconciliationError("blocked", "SIM membership identity collision");
      } else if (membership.role !== profile.expectedRole) {
        if (membership.role === "owner" && profile.expectedRole !== "owner" && await repo.countOwners(workspaceId) <= 1) {
          await repo.audit(workspaceId, "sim.profile.drifted", { persona: profile.personaKey, reason: "sole-owner-protection" });
          return safeResult(profile, "drifted");
        }
        await repo.updateMembership(workspaceId, userId, profile.expectedRole);
        repaired = true;
      }

      await repo.audit(workspaceId, created ? "sim.profile.created" : repaired ? "sim.profile.repaired" : "sim.profile.reused", {
        persona: profile.personaKey,
        runtimeIdentity: profile.runtimeIdentity,
      });
      return safeResult(profile, created ? "created" : repaired ? "repaired" : "reused");
      });
    } catch (error) {
      if (error instanceof SimReconciliationError) throw error;
      if (attempt === 0 && isUniqueConflict(error)) continue;
      throw new SimReconciliationError("blocked", "SIM reconciliation failed");
    }
  }
  throw new SimReconciliationError("blocked", "SIM reconciliation failed");
}

function isUniqueConflict(error: unknown): boolean {
  return typeof error === "object" && error !== null &&
    ("code" in error ? (error as { code?: unknown }).code === "23505" : false);
}

export async function reconcileSimProfileInDatabase(profile: ResolvedSimProfile): Promise<SimReconciliationResult> {
  if ((profile.environment as string) === "production") {
    throw new SimReconciliationError("blocked", "SIM reconciliation is not allowed for production");
  }
  const [{ db }] = await Promise.all([import("@/server/db")]);
  return reconcileSimProfile(profile, (fn) => db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${profile.workspaceName}:${profile.workspaceMarker}`}))`);
    return fn({
    findUsers: async (email) => (await tx.select({ id: authUser.id, email: authUser.email, simMarker: authUser.simMarker }).from(authUser).where(eq(authUser.email, email))).map((row) => row),
    createUser: async ({ id, email, marker }) => {
      await tx.insert(authUser).values({ id, name: email, email, emailVerified: true, simMarker: marker });
      await tx.insert(user).values({ id, username: email, access_level: "standard", sim_marker: marker });
    },
    findWorkspaces: async (name, marker) => tx.select({ id: workspace.id, name: workspace.name, simMarker: workspace.sim_marker }).from(workspace).where(marker ? and(eq(workspace.name, name), eq(workspace.sim_marker, marker)) : eq(workspace.name, name)),
    findWorkspacesByMarker: async (marker) => tx.select({ id: workspace.id, name: workspace.name, simMarker: workspace.sim_marker }).from(workspace).where(eq(workspace.sim_marker, marker)),
    createWorkspace: async ({ id, name, marker }) => { await tx.insert(workspace).values({ id, name, sim_marker: marker, credits: 0, twilio_data: "{}" }); },
    findMembership: async (workspaceId, userId) => { const [row] = await tx.select({ role: workspace_member.role_id, marker: workspace_member.sim_marker }).from(workspace_member).where(and(eq(workspace_member.workspace_id, workspaceId), eq(workspace_member.user_id, userId))); return row ?? null; },
    countOwners: async (workspaceId) => { const rows = await tx.select({ id: workspace_member.id }).from(workspace_member).where(and(eq(workspace_member.workspace_id, workspaceId), eq(workspace_member.role_id, "owner"))); return rows.length; },
    createMembership: async ({ workspaceId, userId, role, marker }) => { await tx.insert(workspace_member).values({ id: `wm:${workspaceId}:${userId}`, workspace_id: workspaceId, user_id: userId, role_id: roleId(role), sim_marker: marker }); },
    updateMembership: async (workspaceId, userId, role) => { await tx.update(workspace_member).set({ role_id: roleId(role) }).where(and(eq(workspace_member.workspace_id, workspaceId), eq(workspace_member.user_id, userId))); },
    audit: async (workspaceId, action, metadata) => { await tx.insert(workspace_audit_event).values({ workspace_id: workspaceId, created_at: new Date().toISOString(), actor_type: "system", action, outcome: "success", metadata }); },
    });
  }));
}
