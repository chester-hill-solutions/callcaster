import Twilio from "twilio";
import { eq } from "drizzle-orm";
import { workspace } from "@/db/schema";
import { db } from "@/server/db";
import {
  getOwnedNumberRelease,
  type NumberRelease,
} from "@/server/number-release-intent.server";
import { env } from "@/lib/env.server";
import { TWILIO_REQUEST_TIMEOUT_MS } from "@/lib/twilio-client-options";
import { readTwilioWorkspaceCredentials } from "@/lib/twilio-workspace-credentials";
import {
  invalidateWorkspaceTwilioData,
  mergeWorkspaceTwilioData,
} from "@/lib/merge-workspace-twilio-data.server";
import { isObject } from "@/lib/type-safety-utils";

export function isNumberReleaseCredentialRejection(error: unknown) {
  return isObject(error) && error.status === 401 && error.code === 20003;
}

type CredentialSnapshot = {
  key: string | null;
  token: string | null;
  accountSid: string;
  authToken: string;
};
function snapshot(
  row: { key: string | null; token: string | null; twilio_data: unknown },
  release: NumberRelease,
): CredentialSnapshot {
  const data =
    typeof row.twilio_data === "string"
      ? JSON.parse(row.twilio_data)
      : row.twilio_data;
  const creds = readTwilioWorkspaceCredentials(data);
  if (!creds || creds.sid !== release.account_sid)
    throw new Error("Original release account configuration is required");
  return {
    key: row.key,
    token: row.token,
    accountSid: creds.sid,
    authToken: creds.authToken,
  };
}

async function readCredentials(release: NumberRelease) {
  await getOwnedNumberRelease(release);
  const [row] = await db
    .select({
      key: workspace.key,
      token: workspace.token,
      twilio_data: workspace.twilio_data,
    })
    .from(workspace)
    .where(eq(workspace.id, release.workspace));
  if (!row) throw new Error("Release workspace not found");
  return snapshot(row, release);
}

function sameCredentials(
  current: CredentialSnapshot,
  expected: CredentialSnapshot,
) {
  return (
    current.key === expected.key &&
    current.token === expected.token &&
    current.accountSid === expected.accountSid &&
    current.authToken === expected.authToken
  );
}

function keyClient(accountSid: string, key: string, token: string) {
  return new Twilio.Twilio(key, token, {
    accountSid,
    timeout: TWILIO_REQUEST_TIMEOUT_MS,
  });
}

async function verifyRecoveredResources(
  release: NumberRelease,
  client: Twilio.Twilio,
) {
  for (const [kind, sids] of [
    ["incoming", release.incoming_sids],
    ["outgoing", release.outgoing_sids],
  ] as const) {
    for (const sid of sids ?? []) {
      await getOwnedNumberRelease(release);
      try {
        const resource =
          kind === "incoming"
            ? await client.incomingPhoneNumbers(sid).fetch()
            : await client.outgoingCallerIds(sid).fetch();
        if (
          resource.sid !== sid ||
          resource.accountSid !== release.account_sid ||
          resource.phoneNumber !== release.phone_number
        ) {
          throw new Error("Recovered release resource identity changed");
        }
      } catch (error) {
        if (!isObject(error) || error.status !== 404 || error.code !== 20404)
          throw error;
      }
    }
  }
}

type RepairedCredentials = { key: string; token: string; authToken: string };

async function mintReleaseKey(
  release: NumberRelease,
  original: CredentialSnapshot,
): Promise<RepairedCredentials> {
  const parentSid = env.TWILIO_SID();
  if (parentSid === release.account_sid)
    throw new Error("Release repair requires an owned subaccount");
  const parent = new Twilio.Twilio(parentSid, env.TWILIO_AUTH_TOKEN(), {
    timeout: TWILIO_REQUEST_TIMEOUT_MS,
  });
  const account = await parent.api.v2010.accounts(release.account_sid).fetch();
  if (
    account.sid !== release.account_sid ||
    account.ownerAccountSid !== parentSid ||
    account.status !== "active" ||
    !account.authToken?.trim()
  ) {
    throw new Error(
      "Active original subaccount ownership could not be verified",
    );
  }
  if (!sameCredentials(await readCredentials(release), original))
    throw new Error("Release credentials changed during repair");
  const authToken = account.authToken.trim();
  const issuer = new Twilio.Twilio(release.account_sid, authToken, {
    timeout: TWILIO_REQUEST_TIMEOUT_MS,
  });
  const key = await issuer.newKeys.create({
    friendlyName: `${release.workspace}-release-recovery`,
  });
  if (!/^SK[\da-f]{32}$/i.test(key.sid) || !key.secret?.trim())
    throw new Error("Recovery API key receipt is incomplete");
  return { key: key.sid, token: key.secret.trim(), authToken };
}

async function persistReleaseKey(
  release: NumberRelease,
  original: CredentialSnapshot,
  credentials: RepairedCredentials,
) {
  await db.transaction(async (tx) => {
    await getOwnedNumberRelease(release, tx);
    const [row] = await tx
      .select({
        key: workspace.key,
        token: workspace.token,
        twilio_data: workspace.twilio_data,
      })
      .from(workspace)
      .where(eq(workspace.id, release.workspace))
      .for("update");
    if (!row || !sameCredentials(snapshot(row, release), original))
      throw new Error("Release credentials changed before repair persistence");
    await mergeWorkspaceTwilioData(
      release.workspace,
      (current) => ({ ...current, authToken: credentials.authToken }),
      tx,
    );
    await tx
      .update(workspace)
      .set({ key: credentials.key, token: credentials.token })
      .where(eq(workspace.id, release.workspace));
  });
  invalidateWorkspaceTwilioData(release.workspace);
}

export async function recoverNumberReleaseClient(
  release: NumberRelease,
  failedClient: Twilio.Twilio,
) {
  const original = await readCredentials(release);
  let client: Twilio.Twilio;
  if (
    original.key?.trim() &&
    original.token?.trim() &&
    (original.key.trim() !== failedClient.username ||
      original.token.trim() !== failedClient.password)
  ) {
    invalidateWorkspaceTwilioData(release.workspace);
    client = keyClient(
      release.account_sid,
      original.key.trim(),
      original.token.trim(),
    );
  } else {
    const credentials = await mintReleaseKey(release, original);
    await persistReleaseKey(release, original, credentials);
    client = keyClient(release.account_sid, credentials.key, credentials.token);
  }
  await verifyRecoveredResources(release, client);
  return client;
}
