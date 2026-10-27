import type { ResolvedSimProfile } from "../../e2e/sim/personas";
import { workspaceResourceName } from "@/lib/twilio-resource-name";
import { invalidateWorkspaceTwilioData, loadWorkspaceTwilioData, mergeWorkspaceTwilioData } from "@/lib/merge-workspace-twilio-data.server";

export type SimTwilioReadiness = "ready" | "missing" | "partial" | "manual-recovery" | "blocked";
export type SimTwilioStatus = Readonly<{
  status: SimTwilioReadiness;
  persona: string;
  profile: string;
  marker: string;
  subaccount: boolean;
  apiKey: boolean;
  messagingService: boolean;
}>;
export type SimTwilioProvider = {
  parent: { accounts: { list(input: { friendlyName: string }): Promise<Array<{ sid: string; friendlyName: string; status?: string }>>; create(input: { friendlyName: string }): Promise<{ sid: string; authToken: string; friendlyName: string }> } };
  account(sid: string, token: string): {
    newKeys: { create(input: { friendlyName: string }): Promise<{ sid: string; secret: string; friendlyName: string }> };
    messagingServices: { list(input: { friendlyName: string }): Promise<Array<{ sid: string; friendlyName: string }>>; create(input: { friendlyName: string }): Promise<{ sid: string; friendlyName: string }> };
  };
  parentSid: string;
};

export function simTwilioStatus(profile: ResolvedSimProfile, data: Record<string, unknown>): SimTwilioStatus {
  const onboarding = data.onboarding && typeof data.onboarding === "object" ? data.onboarding as Record<string, unknown> : {};
  const messaging = onboarding.messagingService && typeof onboarding.messagingService === "object" ? onboarding.messagingService as Record<string, unknown> : {};
  const subaccount = typeof data.sid === "string" && data.sid.length > 0 && typeof data.authToken === "string" && data.authToken.length > 0;
  const apiKey = typeof data.key === "string" && data.key.length > 0 && typeof data.token === "string" && data.token.length > 0;
  const messagingService = typeof messaging.serviceSid === "string" && messaging.serviceSid.length > 0;
  // Twilio returns an API key secret once. The durable pending marker means a
  // create may have succeeded without the secret reaching the canonical DB fields.
  if (!apiKey && data.simTwilioKeyProvisioning === "pending") {
    return { status: "manual-recovery", persona: profile.personaKey, profile: profile.runtimeIdentity, marker: profile.workspaceMarker, subaccount, apiKey, messagingService };
  }
  const count = Number(subaccount) + Number(apiKey) + Number(messagingService);
  return { status: count === 3 ? "ready" : count === 0 ? "missing" : "partial", persona: profile.personaKey, profile: profile.runtimeIdentity, marker: profile.workspaceMarker, subaccount, apiKey, messagingService };
}

function assertLocalSim(profile: ResolvedSimProfile): void {
  if (profile.environment !== "local" || profile.trafficPolicy !== "local-only" || !/^[a-z0-9-]+-local$/.test(profile.runtimeIdentity) || process.env.NODE_ENV === "production" || process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID || process.env.K_SERVICE || process.env.VERCEL || process.env.FLY_APP_NAME) {
    throw new Error("SIM Twilio provisioning is allowed only for an approved local profile");
  }
}

async function ensureSimSubaccount(provider: SimTwilioProvider, workspaceId: string, accountName: string, data: Record<string, unknown>): Promise<Record<string, unknown>> {
  const accounts = await provider.parent.accounts.list({ friendlyName: accountName });
  if (accounts.length > 1 || accounts.some((account) => account.friendlyName !== accountName)) throw new Error("SIM subaccount lookup is ambiguous");
  if (typeof data.sid === "string" && accounts[0]?.sid !== data.sid) throw new Error("SIM subaccount is not owned by the configured parent account");
  if (typeof data.sid === "string") return data;
  const account = accounts[0] ?? await provider.parent.accounts.create({ friendlyName: accountName });
  if (!account.sid || account.friendlyName !== accountName) throw new Error("SIM subaccount identity could not be verified");
  const created = "authToken" in account ? account : null;
  if (!created?.authToken) throw new Error("Existing SIM subaccount token is unavailable; manual recovery is required");
  const next = { ...data, sid: created.sid, authToken: created.authToken };
  await mergeWorkspaceTwilioData(workspaceId, (current) => ({ ...current, sid: created.sid, authToken: created.authToken }));
  invalidateWorkspaceTwilioData(workspaceId);
  return next;
}

async function ensureSimMessagingService(workspaceId: string, workspaceName: string, client: ReturnType<SimTwilioProvider["account"]>): Promise<string> {
  const messagingName = `${workspaceName} Messaging`;
  const services = await client.messagingServices.list({ friendlyName: messagingName });
  if (services.length > 1 || services.some((service) => service.friendlyName !== messagingName)) throw new Error("SIM Messaging Service lookup is ambiguous");
  const service = services[0] ?? await client.messagingServices.create({ friendlyName: messagingName });
  if (!service.sid || service.friendlyName !== messagingName) throw new Error("SIM Messaging Service identity could not be verified");
  await mergeWorkspaceTwilioData(workspaceId, (current) => ({ ...current, onboarding: { ...(current.onboarding as Record<string, unknown> ?? {}), messagingService: { ...((current.onboarding as Record<string, unknown> | undefined)?.messagingService as Record<string, unknown> ?? {}), friendlyName: messagingName, serviceSid: service.sid, provisioningStatus: "live" } } }));
  const { ensureWorkspaceTwilioBootstrap } = await import("@/lib/twilio-bootstrap.server");
  await ensureWorkspaceTwilioBootstrap({ workspaceId, actorUserId: null });
  return service.sid;
}

/** Provider access is deliberately injected after local identity and workspace checks. */
export async function ensureSimTwilioProvisioning(
  profile: ResolvedSimProfile,
  workspaceId: string,
  providerFactory: () => Promise<SimTwilioProvider>,
): Promise<SimTwilioStatus> {
  assertLocalSim(profile);
  const { getSimProvisioningWorkspace } = await import("@/lib/database/workspace.server");
  const row = await getSimProvisioningWorkspace(workspaceId, profile.workspaceMarker);
  if (!row || row.sim_marker !== profile.workspaceMarker) throw new Error("SIM workspace identity is not an exact marked local match");
  const initial: Record<string, unknown> = { ...await loadWorkspaceTwilioData(workspaceId), key: row.key, token: row.token };
  const state = simTwilioStatus(profile, initial);
  if (state.status === "ready") return state;

  // This is the first point at which provider credentials, SDK, or client may load.
  const provider = await providerFactory();
  const baseName = workspaceResourceName(row.name, workspaceId);
  const accountName = `${baseName} · sim`;
  let data = await ensureSimSubaccount(provider, workspaceId, accountName, initial);

  const client = provider.account(data.sid as string, data.authToken as string);
  const keyName = `${baseName} · sim key`;
  if (typeof data.key !== "string" || typeof data.token !== "string") {
    if (data.simTwilioKeyProvisioning === "pending") throw new Error("SIM API key creation may have succeeded before persistence; manual recovery is required");
    await mergeWorkspaceTwilioData(workspaceId, (current) => ({ ...current, simTwilioKeyProvisioning: "pending" }));
    const key = await client.newKeys.create({ friendlyName: keyName });
    if (!key.sid || !key.secret || key.friendlyName !== keyName) throw new Error("SIM API key identity could not be verified");
    const { persistSimWorkspaceApiKey } = await import("@/lib/database/workspace.server");
    await persistSimWorkspaceApiKey(workspaceId, key.sid, key.secret);
    await mergeWorkspaceTwilioData(workspaceId, (current) => {
      const { simTwilioKeyProvisioning: _pending, ...remaining } = current;
      return remaining;
    });
    data = { ...data, key: key.sid, token: key.secret };
  }

  await ensureSimMessagingService(workspaceId, row.name, client);
  const saved = await loadWorkspaceTwilioData(workspaceId);
  const savedWorkspace = await getSimProvisioningWorkspace(workspaceId, profile.workspaceMarker);
  const result = simTwilioStatus(profile, { ...saved, key: savedWorkspace?.key, token: savedWorkspace?.token });
  if (result.status !== "ready") throw new Error("SIM Twilio credentials were not durably saved; inspect redacted status before recovery");
  return result;
}
