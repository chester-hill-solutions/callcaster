import type Twilio from "twilio";
import { withTwilioRetry } from "@/lib/twilio-client.server";
import { isObject } from "@/lib/type-safety-utils";
import { logger } from "@/lib/logger.server";
import {
  beginNumberRelease,
  deferNumberRelease,
  finishNumberRelease,
  getNumberRelease,
  getOwnedNumberRelease,
  prepareNumberReleaseBookkeeping,
  recordNumberReleaseProvider,
  saveNumberReleaseTargets,
  type NumberRelease,
} from "@/server/number-release-intent.server";

export class NumberReleaseIncompleteError extends Error {
  constructor(phone: string) {
    super(
      `Release incomplete for ${phone}. Retry to finish sender cleanup and number release.`,
    );
    this.name = "NumberReleaseIncompleteError";
  }
}

function isResourceAbsent(error: unknown) {
  return isObject(error) && error.status === 404 && error.code === 20404;
}

const PROVIDER_NUMBER_SID = /^PN[\da-f]{32}$/i;

function verifiedResourceSid(
  release: NumberRelease,
  resource: { sid: string; accountSid: string; phoneNumber: string },
) {
  if (
    resource.accountSid !== release.account_sid ||
    resource.phoneNumber !== release.phone_number ||
    !PROVIDER_NUMBER_SID.test(resource.sid)
  ) {
    throw new Error("Number release resource identity could not be verified");
  }
  return resource.sid;
}

async function providerOperation<T>(
  release: NumberRelease,
  twilio: Twilio.Twilio,
  operation: string,
  fn: () => Promise<T>,
) {
  return withTwilioRetry(
    async () => {
      await getOwnedNumberRelease(release);
      if (twilio.accountSid !== release.account_sid)
        throw new Error("Number release needs the original provider account");
      return fn();
    },
    { workspaceId: release.workspace, operation: `numberRelease.${operation}` },
  );
}

async function resolveIncomingSids(
  release: NumberRelease,
  twilio: Twilio.Twilio,
) {
  if (release.number_type === "caller_id") return [];
  const recordedSid = release.provider_sid;
  if (recordedSid) {
    if (!PROVIDER_NUMBER_SID.test(recordedSid)) {
      throw new Error("Number release resource SID is invalid");
    }
    try {
      const resource = await providerOperation(
        release,
        twilio,
        "incoming.fetch",
        () => twilio.incomingPhoneNumbers(recordedSid).fetch(),
      );
      if (verifiedResourceSid(release, resource) !== recordedSid)
        throw new Error("Number release SID changed");
    } catch (error) {
      if (!isResourceAbsent(error)) throw error;
    }
    return [recordedSid];
  }
  const resources = await providerOperation(
    release,
    twilio,
    "incoming.list",
    () =>
      twilio.incomingPhoneNumbers.list({
        phoneNumber: release.phone_number,
        limit: 100,
      }),
  );
  if (resources.length > 1)
    throw new Error("Legacy number release is ambiguous");
  return resources.map((resource) => verifiedResourceSid(release, resource));
}

async function resolveOutgoingSids(
  release: NumberRelease,
  twilio: Twilio.Twilio,
) {
  const resources = await providerOperation(
    release,
    twilio,
    "outgoing.list",
    () =>
      twilio.outgoingCallerIds.list({
        phoneNumber: release.phone_number,
        limit: 100,
      }),
  );
  return resources.map((resource) => verifiedResourceSid(release, resource));
}

async function removeResource(
  release: NumberRelease,
  twilio: Twilio.Twilio,
  operation: string,
  remove: () => Promise<boolean>,
) {
  try {
    const removed = await providerOperation(release, twilio, operation, remove);
    if (!removed)
      throw new Error("Provider resource removal was not confirmed");
  } catch (error) {
    // Only the exact recorded resource on the original account can be absent.
    if (!isResourceAbsent(error)) throw error;
  }
}

async function releaseProviderResources(
  release: NumberRelease,
  twilio: Twilio.Twilio,
) {
  for (const serviceSid of release.messaging_service_sids) {
    for (const sid of release.incoming_sids ?? []) {
      await removeResource(release, twilio, "sender.detach", () =>
        twilio.messaging.v1.services(serviceSid).phoneNumbers(sid).remove(),
      );
    }
  }
  for (const sid of release.outgoing_sids ?? []) {
    await removeResource(release, twilio, "outgoing.release", () =>
      twilio.outgoingCallerIds(sid).remove(),
    );
  }
  for (const sid of release.incoming_sids ?? []) {
    await removeResource(release, twilio, "incoming.release", () =>
      twilio.incomingPhoneNumbers(sid).remove(),
    );
  }
}

export async function resumeNumberRelease(
  release: NumberRelease,
  twilio: Twilio.Twilio | null,
) {
  release = await getOwnedNumberRelease(release);
  if (release.state !== "released") {
    if (!twilio) throw new Error("Number release provider client is required");
    if (release.incoming_sids === null || release.outgoing_sids === null) {
      const incoming = await resolveIncomingSids(release, twilio);
      const outgoing = await resolveOutgoingSids(release, twilio);
      release = await saveNumberReleaseTargets(release, incoming, outgoing);
    }
    release = await prepareNumberReleaseBookkeeping(release);
    await releaseProviderResources(release, twilio);
    release = await recordNumberReleaseProvider(release);
  }
  await finishNumberRelease(release);
}

export async function retainNumberReleaseForRecovery(release: NumberRelease) {
  try {
    await deferNumberRelease(release);
  } catch (error) {
    // The committed intent remains recoverable when its lease expires.
    logger.error("number_release.defer_failed", {
      workspaceId: release.workspace,
      releaseId: release.id,
      error,
    });
  }
}

async function executeNumberRelease(
  release: NumberRelease,
  twilio: Twilio.Twilio | null,
) {
  try {
    await resumeNumberRelease(release, twilio);
    return { error: null };
  } catch (error) {
    logger.error("number_release.incomplete", {
      workspaceId: release.workspace,
      releaseId: release.id,
      error,
    });
    try {
      if (
        (await getNumberRelease(release.workspace, release.number_id))
          ?.state === "completed"
      )
        return { error: null };
    } catch (readError) {
      logger.error("number_release.completion_check_failed", {
        releaseId: release.id,
        error: readError,
      });
    }
    await retainNumberReleaseForRecovery(release);
    return { error: new NumberReleaseIncompleteError(release.phone_number) };
  }
}

export async function releaseNumberForWorkspace(args: {
  workspaceId: string;
  numberId: bigint;
  getTwilioClient: () => Promise<Twilio.Twilio>;
}) {
  let existing: NumberRelease | undefined;
  try {
    const numberId = Number(args.numberId);
    if (!Number.isSafeInteger(numberId) || numberId <= 0)
      throw new Error("Invalid number ID");
    existing = await getNumberRelease(args.workspaceId, numberId);
    if (existing?.state === "completed") return { error: null };
    if (existing && existing.lease_expires_at.getTime() > Date.now()) {
      return { error: new NumberReleaseIncompleteError(existing.phone_number) };
    }
    const twilio =
      existing?.state === "released" ? null : await args.getTwilioClient();
    const accountSid = twilio?.accountSid ?? existing?.account_sid;
    if (!accountSid)
      throw new Error("Number release provider account is missing");
    const prepared = await beginNumberRelease(
      args.workspaceId,
      numberId,
      accountSid,
    );
    if (prepared.release.state === "completed") return { error: null };
    if (!prepared.owned)
      return {
        error: new NumberReleaseIncompleteError(prepared.release.phone_number),
      };
    return executeNumberRelease(prepared.release, twilio);
  } catch (error) {
    logger.error("number_release.prepare_failed", {
      workspaceId: args.workspaceId,
      error,
    });
    if (existing) {
      return { error: new NumberReleaseIncompleteError(existing.phone_number) };
    }
    return {
      error: new Error(
        "Number release could not start. Check the provider account and try again. No provider number was released.",
      ),
    };
  }
}
