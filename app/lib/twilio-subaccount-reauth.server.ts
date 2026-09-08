/**
 * Self-heals a workspace's Twilio subaccount credentials after an
 * authentication failure (Twilio code 20003, "Authenticate").
 */
import { eq } from "drizzle-orm";
import { workspace as workspaceTable } from "@/db/schema";
import { adminDb } from "@/server/admin-db";
import { env } from "@/lib/env.server";
import { logger } from "@/lib/logger.server";
import { presentTwilioError } from "@/lib/twilio-errors";
import { readTwilioWorkspaceCredentials } from "@/lib/twilio-workspace-credentials";
import {
  invalidateWorkspaceTwilioData,
  loadWorkspaceTwilioData,
  mergeWorkspaceTwilioData,
} from "@/lib/merge-workspace-twilio-data.server";
import { syncWorkspaceTwilioSnapshot } from "@/lib/database/workspace-twilio-sync.server";
import type { WorkspaceTwilioSyncSnapshot } from "@/lib/types";

async function loadTwilioSdk() {
  const { default: TwilioSdk } = await import("twilio");
  return TwilioSdk;
}

export type WorkspaceTwilioReauthResult = {
  /** Whether the stored Auth Token was itself rejected and had to be refetched from the master account. */
  authTokenRefreshedFromMaster: boolean;
  newApiKeySid: string;
  syncSnapshot: WorkspaceTwilioSyncSnapshot;
};

/**
 * Live Twilio traffic authenticates with an API Key (workspace.key/token)
 * when one is on file, which is independently revocable in Twilio Console
 * without touching the subaccount's Account SID/Auth Token. So the fix is
 * two-tier:
 *  1. Mint a fresh API Key using the stored Auth Token — covers a
 *     revoked/deleted API Key, the common case.
 *  2. Only if the Auth Token itself is rejected, refetch the subaccount's
 *     current Auth Token from our master Twilio account (which can always
 *     read a subaccount it owns, regardless of the subaccount's own
 *     credentials) and retry step 1.
 */
export async function reauthenticateWorkspaceTwilioSubaccount({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<WorkspaceTwilioReauthResult> {
  const twilioData = await loadWorkspaceTwilioData(workspaceId);
  const creds = readTwilioWorkspaceCredentials(twilioData);

  if (!creds) {
    throw new Error(
      "Workspace has no Twilio subaccount SID/Auth Token on file — nothing to re-authenticate.",
    );
  }

  const TwilioSdk = await loadTwilioSdk();

  const mintApiKey = (sid: string, authToken: string) =>
    new TwilioSdk.Twilio(sid, authToken).newKeys.create({
      friendlyName: `${workspaceId}-reauth-${Date.now()}`,
    });

  let authTokenRefreshedFromMaster = false;
  let newKey;

  try {
    newKey = await mintApiKey(creds.sid, creds.authToken);
  } catch (firstError) {
    const presented = presentTwilioError(firstError);
    if (presented.twilioCode !== 20003) {
      logger.error("Twilio subaccount re-auth: minting API key failed for a non-auth reason", {
        workspaceId,
        error: firstError,
      });
      throw new Error(`Could not mint a new Twilio API key: ${presented.adminDetail}`);
    }

    const masterTwilio = new TwilioSdk.Twilio(env.TWILIO_SID(), env.TWILIO_AUTH_TOKEN());
    let account;
    try {
      account = await masterTwilio.api.v2010.accounts(creds.sid).fetch();
    } catch (masterError) {
      logger.error("Twilio subaccount re-auth: master refetch failed", {
        workspaceId,
        sid: creds.sid,
        error: masterError,
      });
      throw new Error(
        `Subaccount ${creds.sid} is unreachable even from the master Twilio account (${presentTwilioError(masterError).adminDetail}). It may have been closed or detached — re-provisioning may be required instead of re-authentication.`,
      );
    }

    const freshAuthToken = account.authToken;
    if (!freshAuthToken) {
      throw new Error(`Master account returned no Auth Token for subaccount ${creds.sid}.`);
    }

    authTokenRefreshedFromMaster = true;
    await mergeWorkspaceTwilioData(workspaceId, (current) => ({
      ...current,
      authToken: freshAuthToken,
    }));

    newKey = await mintApiKey(creds.sid, freshAuthToken);
  }

  await adminDb
    .update(workspaceTable)
    .set({ key: newKey.sid, token: newKey.secret })
    .where(eq(workspaceTable.id, workspaceId));
  invalidateWorkspaceTwilioData(workspaceId);

  logger.warn("Workspace Twilio subaccount re-authenticated", {
    workspaceId,
    authTokenRefreshedFromMaster,
    newApiKeySid: newKey.sid,
  });

  const syncSnapshot = await syncWorkspaceTwilioSnapshot({ workspaceId });

  return {
    authTokenRefreshedFromMaster,
    newApiKeySid: newKey.sid,
    syncSnapshot,
  };
}
