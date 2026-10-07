import Twilio from "twilio";
import {
  getOwnedNumberRelease,
  getNumberReleaseCredentials,
  persistNumberReleaseCredentials,
  numberReleaseCredentialsMatch,
  type NumberReleaseCredentials,
  type NumberRelease,
} from "@/server/number-release-intent.server";
import { env } from "@/lib/env.server";
import { TWILIO_REQUEST_TIMEOUT_MS } from "@/lib/twilio-client-options";
import { invalidateWorkspaceTwilioData } from "@/lib/merge-workspace-twilio-data.server";
import { isObject } from "@/lib/type-safety-utils";

export function isNumberReleaseCredentialRejection(error: unknown) {
  return isObject(error) && error.status === 401 && error.code === 20003;
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
  original: NumberReleaseCredentials,
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
  if (
    !numberReleaseCredentialsMatch(
      await getNumberReleaseCredentials(release),
      original,
    )
  )
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

export async function recoverNumberReleaseClient(
  release: NumberRelease,
  failedClient: Twilio.Twilio,
) {
  const original = await getNumberReleaseCredentials(release);
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
    await persistNumberReleaseCredentials(release, original, credentials);
    client = keyClient(release.account_sid, credentials.key, credentials.token);
  }
  await verifyRecoveredResources(release, client);
  return client;
}
