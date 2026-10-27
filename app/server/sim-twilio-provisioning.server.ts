import type { ResolvedSimProfile } from "../../e2e/sim/personas";
import { getSimProfileStatusInDatabase } from "@/server/sim-profile-status.server";
import { ensureSimTwilioProvisioning, type SimTwilioProvider } from "@/lib/sim-twilio-provisioning.server";

function assertLocal(profile: ResolvedSimProfile): void {
  if (profile.environment !== "local" || profile.trafficPolicy !== "local-only" || !/^[a-z0-9-]+-local$/.test(profile.runtimeIdentity) || process.env.NODE_ENV === "production" || process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID || process.env.K_SERVICE || process.env.VERCEL || process.env.FLY_APP_NAME) throw new Error("SIM Twilio operation is allowed only for approved local runtime");
}

export async function getSimTwilioStatusInDatabase(profile: ResolvedSimProfile) {
  assertLocal(profile);
  const profileStatus = await getSimProfileStatusInDatabase(profile);
  if (profileStatus.status !== "ready" || !profileStatus.workspaceId) return { status: profileStatus.status === "missing" ? "missing" as const : "blocked" as const, persona: profile.personaKey, profile: profile.runtimeIdentity, marker: profile.workspaceMarker, subaccount: false, apiKey: false, messagingService: false };
  const { getSimTwilioReadinessBits } = await import("@/lib/database/workspace.server");
  const bits = await getSimTwilioReadinessBits(profileStatus.workspaceId, profile.workspaceMarker);
  if (!bits) return { status: "blocked" as const, persona: profile.personaKey, profile: profile.runtimeIdentity, marker: profile.workspaceMarker, subaccount: false, apiKey: false, messagingService: false };
  const subaccount = bits.subaccount === true;
  const apiKey = bits.apiKey === true;
  const messagingService = bits.messagingService === true;
  const count = Number(subaccount) + Number(apiKey) + Number(messagingService);
  return { status: count === 3 ? "ready" as const : count === 0 ? "missing" as const : "partial" as const, persona: profile.personaKey, profile: profile.runtimeIdentity, marker: profile.workspaceMarker, subaccount, apiKey, messagingService };
}

export async function ensureSimTwilioInDatabase(profile: ResolvedSimProfile) {
  assertLocal(profile);
  const status = await getSimProfileStatusInDatabase(profile);
  if (status.status !== "ready" || !status.workspaceId) throw new Error("Exact marked SIM profile must already exist before Twilio provisioning");
  return ensureSimTwilioProvisioning(profile, status.workspaceId, async () => {
    const { env } = await import("@/lib/env.server");
    const { default: TwilioSdk } = await import("twilio");
    const parentSid = env.TWILIO_SID();
    const parentToken = env.TWILIO_AUTH_TOKEN();
    const parent = new TwilioSdk.Twilio(parentSid, parentToken);
    return {
      parent: parent.api.v2010,
      parentSid,
      account: (sid: string, token: string) => {
        const accountClient = new TwilioSdk.Twilio(sid, token);
        return {
          newKeys: { create: accountClient.newKeys.create.bind(accountClient.newKeys) },
          messagingServices: accountClient.messaging.v1.services,
        };
      },
    } as unknown as SimTwilioProvider;
  });
}
