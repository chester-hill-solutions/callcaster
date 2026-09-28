import type { NewKeyInstance } from "twilio/lib/rest/api/v2010/account/newKey";

import { env } from "@/lib/env.server";
import { logger } from "@/lib/logger.server";
import { workspaceResourceName } from "@/lib/twilio-resource-name";

/**
 * Creation of the Twilio subaccount and API key a workspace is provisioned
 * with.
 *
 * This lives apart from `workspace.server.ts` because it is the only part of
 * that module that talks to Twilio rather than to Postgres, and the two files
 * were already at their respective size ratchets.
 *
 * Both resources are named with {@link workspaceResourceName} rather than the
 * raw workspace uuid, which is what this code sent unconditionally before.
 */

async function loadTwilioSdk() {
  const { default: TwilioSdk } = await import("twilio");
  return TwilioSdk;
}

export async function createKeys({
  workspace_id,
  workspace_name,
  sid,
  token,
}: {
  workspace_id: string;
  /** Feeds the key's friendlyName; optional so existing callers still compile. */
  workspace_name?: string | null;
  sid: string;
  token: string;
}): Promise<NewKeyInstance> {
  const TwilioSdk = await loadTwilioSdk();
  const twilio = new TwilioSdk.Twilio(sid, token);
  try {
    const newKey = await twilio.newKeys.create({
      friendlyName: `${workspaceResourceName(workspace_name, workspace_id)} · key`,
    });
    return newKey;
  } catch (error) {
    logger.error("Error creating keys", error);
    throw error;
  }
}

export async function createSubaccount({
  workspace_id,
  workspace_name,
}: {
  workspace_id: string;
  /** Feeds the subaccount's friendlyName; optional so existing callers still compile. */
  workspace_name?: string | null;
}) {
  const TwilioSdk = await loadTwilioSdk();
  const twilio = new TwilioSdk.Twilio(env.TWILIO_SID(), env.TWILIO_AUTH_TOKEN());
  const account = await twilio.api.v2010.accounts
    .create({
      friendlyName: workspaceResourceName(workspace_name, workspace_id),
    })
    .catch((error) => {
      logger.error("Error creating subaccount", error);
    });
  return account;
}
