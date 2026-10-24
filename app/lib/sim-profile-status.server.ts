import { and, eq, isNull } from "drizzle-orm";
import { authUser } from "@/db/auth-schema";
import { user, workspace, workspace_member } from "@/db/schema";
import { hasMinRole, isMemberRole, MemberRole } from "@/lib/member-role";
import type { ResolvedSimProfile } from "../../e2e/sim/personas";

export type SimProfileStatus = "ready" | "missing" | "blocked" | "drifted";

export type SimProfileStatusResult = Readonly<{
  status: SimProfileStatus;
  persona: string;
  environment: string;
  runtimeIdentity: string;
  email: string;
  workspaceName: string;
  workspaceMarker: string;
  workspaceId?: string;
  expectedRole: string;
  actualRole?: string;
  capabilities: readonly string[];
  flows: readonly string[];
  trafficPolicy: string;
  providerName: string;
  credentialName: string;
}>;

export type SimProfileStatusRepository = Readonly<{
  findUsersByEmail(email: string): Promise<Array<{ id: string; email: string; simMarker: string | null }>>;
  findApplicationUserById(userId: string): Promise<{ id: string; simMarker: string | null } | null>;
  findWorkspacesByNameAndMarker(name: string, marker: string): Promise<Array<{ id: string; name: string; simMarker: string | null }>>;
  findUnmarkedWorkspacesByName(name: string): Promise<Array<{ id: string; name: string; simMarker: string | null }>>;
  findMembership(workspaceId: string, userId: string): Promise<{ role: string; marker: string | null } | null>;
}>;

export type SimProfileAccessResult = Readonly<{
  allowed: boolean;
  status: SimProfileStatus;
  persona: string;
  capability: string;
  flow?: string;
  reason: "ready" | "profile-not-ready" | "capability-not-declared" | "flow-not-declared" | "role-not-authorized";
}>;

function baseResult(profile: ResolvedSimProfile, status: SimProfileStatus): SimProfileStatusResult {
  return {
    status,
    persona: profile.personaKey,
    environment: profile.environment,
    runtimeIdentity: profile.runtimeIdentity,
    email: profile.email,
    workspaceName: profile.workspaceName,
    workspaceMarker: profile.workspaceMarker,
    expectedRole: profile.expectedRole,
    capabilities: profile.capabilities,
    flows: profile.allowedFlows,
    trafficPolicy: profile.trafficPolicy,
    providerName: profile.selectedProviderName,
    credentialName: profile.credentialName,
  };
}

function withWorkspace(result: SimProfileStatusResult, workspaceId: string): SimProfileStatusResult {
  return { ...result, workspaceId };
}

export async function getSimProfileStatus(
  profile: ResolvedSimProfile,
  repository: SimProfileStatusRepository,
): Promise<SimProfileStatusResult> {
  const result = baseResult(profile, "missing");
  const users = await repository.findUsersByEmail(profile.email);
  const userRow = users[0];
  if (!userRow) return result;
  if (users.some((row) => row.simMarker !== profile.workspaceMarker)) {
    return baseResult(profile, "blocked");
  }
  const applicationUser = await repository.findApplicationUserById(userRow.id);
  if (!applicationUser) return result;
  if (applicationUser.simMarker !== profile.workspaceMarker) {
    return baseResult(profile, "blocked");
  }

  const exactWorkspaces = await repository.findWorkspacesByNameAndMarker(profile.workspaceName, profile.workspaceMarker);
  const unmarkedWorkspaces = await repository.findUnmarkedWorkspacesByName(profile.workspaceName);
  if (unmarkedWorkspaces.length > 0) return baseResult(profile, "blocked");
  if (exactWorkspaces.length === 0) return result;
  if (exactWorkspaces.length > 1) return baseResult(profile, "blocked");

  const workspaceRow = exactWorkspaces[0];
  if (!workspaceRow) return result;
  const membership = await repository.findMembership(workspaceRow.id, userRow.id);
  const workspaceResult = withWorkspace(result, workspaceRow.id);
  if (!membership) return workspaceResult;
  const marked = membership.marker === profile.workspaceMarker;
  if (!marked) return { ...workspaceResult, status: "blocked", actualRole: membership.role };
  if (membership.role !== profile.expectedRole) return { ...workspaceResult, status: "drifted", actualRole: membership.role };
  return { ...workspaceResult, status: "ready", actualRole: membership.role };
}

const CAPABILITY_MIN_ROLE: Readonly<Record<string, MemberRole>> = {
  "workspace.read": MemberRole.Member,
  "billing.purchaseTestCredits": MemberRole.Owner,
  "simulation.manage": MemberRole.Owner,
  "audience.write": MemberRole.Member,
  "campaign.write": MemberRole.Member,
  "message.send": MemberRole.Member,
};

export const SIM_CAPABILITIES = Object.freeze(Object.keys(CAPABILITY_MIN_ROLE));

export async function checkSimProfileAccess(
  profile: ResolvedSimProfile,
  repository: SimProfileStatusRepository,
  capability: string,
  flow?: string,
): Promise<SimProfileAccessResult> {
  const common = { persona: profile.personaKey, capability, ...(flow === undefined ? {} : { flow }) };
  const status = await getSimProfileStatus(profile, repository);
  if (status.status !== "ready") return { ...common, allowed: false, status: status.status, reason: "profile-not-ready" };
  if (!SIM_CAPABILITIES.includes(capability) || !profile.capabilities.includes(capability)) return { ...common, allowed: false, status: status.status, reason: "capability-not-declared" };
  if (flow !== undefined && !profile.allowedFlows.includes(flow)) return { ...common, allowed: false, status: status.status, reason: "flow-not-declared" };
  const minimumRole = CAPABILITY_MIN_ROLE[capability];
  if (!minimumRole || !isMemberRole(status.actualRole) || !hasMinRole(status.actualRole, minimumRole)) {
    return { ...common, allowed: false, status: status.status, reason: "role-not-authorized" };
  }
  return { ...common, allowed: true, status: status.status, reason: "ready" };
}

export async function getSimProfileStatusInDatabase(profile: ResolvedSimProfile): Promise<SimProfileStatusResult> {
  return getSimProfileStatus(profile, await createSimProfileStatusRepository(profile));
}

export async function checkSimProfileAccessInDatabase(
  profile: ResolvedSimProfile,
  capability: string,
  flow?: string,
): Promise<SimProfileAccessResult> {
  return checkSimProfileAccess(profile, await createSimProfileStatusRepository(profile), capability, flow);
}

async function createSimProfileStatusRepository(profile: ResolvedSimProfile): Promise<SimProfileStatusRepository> {
  if ((profile.environment as string) === "production") throw new Error("SIM profile status is not allowed for production");
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
