import type { ResolvedSimProfile } from "../../e2e/sim/personas";
import { isUniqueViolation } from "@/lib/parse-utils.server";

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

async function reconcileWithinTransaction(
  profile: ResolvedSimProfile,
  repo: ReconcileRepo,
): Promise<SimReconciliationResult> {
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
  if (sameName.some((row) => row.simMarker === null) || markedWorkspaces.length > 1) {
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
}

export async function reconcileSimProfile(profile: ResolvedSimProfile, transaction: ReconcileTransaction): Promise<SimReconciliationResult> {
  if ((profile.environment as string) === "production") {
    throw new SimReconciliationError("blocked", "SIM reconciliation is not allowed for production");
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      // The transaction keeps identity, collision, membership, and owner checks atomic.
      return await transaction((repo) => reconcileWithinTransaction(profile, repo));
    } catch (error) {
      if (error instanceof SimReconciliationError) throw error;
      if (attempt === 0 && isUniqueViolation(error)) continue;
      throw new SimReconciliationError("blocked", "SIM reconciliation failed");
    }
  }
  throw new SimReconciliationError("blocked", "SIM reconciliation failed");
}
