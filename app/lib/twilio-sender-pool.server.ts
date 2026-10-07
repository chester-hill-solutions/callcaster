import type { Database } from "@/lib/db-types";
import { getWorkspaceMessagingOnboardingFromTwilioData } from "@/lib/messaging-onboarding.server";
import {
  attachChannelSenderToMessagingService,
  createWorkspaceTwilioClient,
  listMessagingServiceChannelSenders,
  listMessagingServicePhoneNumbers,
} from "@/lib/twilio-client.server";
import {
  getWorkspaceTwilioDataVersion,
  invalidateWorkspaceTwilioData,
  loadWorkspaceTwilioData,
} from "@/lib/merge-workspace-twilio-data.server";
import type { TwilioAccountData } from "@/lib/types";
import { readTwilioWorkspaceCredentials } from "@/lib/twilio-workspace-credentials";

export type SenderPoolVerificationResult = {
  serviceSid: string | null;
  expectedPhoneNumbers: string[];
  livePhoneNumbers: string[];
  missingFromPool: string[];
  extraInPool: string[];
  inSync: boolean;
  /** RCS sender SID recorded on the workspace's onboarding state, if any (XE-prefixed). */
  rcsSenderId: string | null;
  /** Whether `rcsSenderId` is currently attached to the Messaging Service's sender pool. */
  rcsSenderInPool: boolean;
};

export type RcsSenderPoolAttachResult = {
  serviceSid: string | null;
  rcsSenderId: string | null;
  /** True when this call performed the attach (it was not already in the pool). */
  attached: boolean;
  /** True when the sender was already present in the pool (no-op). */
  alreadyInPool: boolean;
};

function normalizePhone(phone: string): string {
  return phone.replace(/\s/g, "");
}

const INTERACTIVE_SENDER_POOL_TTL_MS = 30_000;
const MAX_INTERACTIVE_SENDER_POOLS = 1_024;
type SenderPoolSnapshot = {
  key: string;
  expiresAt: number;
  result: Promise<SenderPoolVerificationResult>;
};
const interactiveSenderPools = new Map<string, SenderPoolSnapshot>();

export async function verifyWorkspaceMessagingSenderPool({
  workspaceId,
  reuseProviderSnapshot = false,
}: {
  workspaceId: string;
  reuseProviderSnapshot?: boolean;
}): Promise<SenderPoolVerificationResult> {
  const version = getWorkspaceTwilioDataVersion(workspaceId);
  const twilioData = (await loadWorkspaceTwilioData(
    workspaceId,
  )) as TwilioAccountData;
  const onboarding = getWorkspaceMessagingOnboardingFromTwilioData(twilioData);
  const key = JSON.stringify([
    version,
    readTwilioWorkspaceCredentials(twilioData)?.sid,
    onboarding.messagingService.serviceSid,
    onboarding.messagingService.attachedSenderPhoneNumbers,
    onboarding.rcs.senderId,
  ]);
  const now = Date.now();
  let snapshot = interactiveSenderPools.get(workspaceId);
  if (
    !reuseProviderSnapshot ||
    !snapshot ||
    snapshot.key !== key ||
    snapshot.expiresAt <= now
  ) {
    interactiveSenderPools.delete(workspaceId);
    snapshot = {
      key,
      expiresAt: now + INTERACTIVE_SENDER_POOL_TTL_MS,
      result: readWorkspaceMessagingSenderPool(workspaceId, twilioData),
    };
    if (reuseProviderSnapshot) {
      for (const [id, entry] of interactiveSenderPools) {
        if (entry.expiresAt <= now) interactiveSenderPools.delete(id);
      }
      if (interactiveSenderPools.size >= MAX_INTERACTIVE_SENDER_POOLS) {
        const oldest = interactiveSenderPools.keys().next().value;
        if (oldest !== undefined) interactiveSenderPools.delete(oldest);
      }
      interactiveSenderPools.set(workspaceId, snapshot);
    }
  }
  try {
    const result = await snapshot.result;
    if (getWorkspaceTwilioDataVersion(workspaceId) !== version) {
      throw new Error(
        "Messaging configuration changed during sender verification. Try again.",
      );
    }
    return structuredClone(result);
  } catch (error) {
    if (interactiveSenderPools.get(workspaceId) === snapshot) {
      interactiveSenderPools.delete(workspaceId);
    }
    throw error;
  }
}

async function readWorkspaceMessagingSenderPool(
  workspaceId: string,
  twilioData: TwilioAccountData,
): Promise<SenderPoolVerificationResult> {
  const onboarding = getWorkspaceMessagingOnboardingFromTwilioData(twilioData);
  const serviceSid = onboarding.messagingService.serviceSid;
  const expectedPhoneNumbers =
    onboarding.messagingService.attachedSenderPhoneNumbers.map(normalizePhone);
  const rcsSenderId = onboarding.rcs.senderId;

  if (!serviceSid) {
    return {
      serviceSid: null,
      expectedPhoneNumbers,
      livePhoneNumbers: [],
      missingFromPool: [...expectedPhoneNumbers],
      extraInPool: [],
      inSync: expectedPhoneNumbers.length === 0,
      rcsSenderId,
      rcsSenderInPool: false,
    };
  }

  const twilio = await createWorkspaceTwilioClient({
    workspaceId,
  });

  const pool = await listMessagingServicePhoneNumbers(twilio, serviceSid, {
    workspaceId,
    operation: "messagingService.phoneNumbers.list",
  });

  const livePhoneNumbers = pool
    .map((entry) => entry.phoneNumber)
    .filter((p): p is string => Boolean(p))
    .map(normalizePhone);

  const expectedSet = new Set(expectedPhoneNumbers);
  const liveSet = new Set(livePhoneNumbers);

  const missingFromPool = expectedPhoneNumbers.filter((p) => !liveSet.has(p));
  const extraInPool = livePhoneNumbers.filter((p) => !expectedSet.has(p));

  let rcsSenderInPool = false;
  if (rcsSenderId) {
    const channelSenders = await listMessagingServiceChannelSenders(
      twilio,
      serviceSid,
      {
        workspaceId,
        operation: "messagingService.channelSenders.list",
      },
    );
    rcsSenderInPool = channelSenders.some(
      (sender) => sender.sid === rcsSenderId,
    );
  }

  return {
    serviceSid,
    expectedPhoneNumbers,
    livePhoneNumbers,
    missingFromPool,
    extraInPool,
    inSync: missingFromPool.length === 0 && extraInPool.length === 0,
    rcsSenderId,
    rcsSenderInPool,
  };
}

/**
 * Attach the workspace's recorded RCS sender SID (pasted back from Twilio Console
 * after Google/carrier approval) to the workspace's Messaging Service sender pool.
 *
 * Twilio does not offer a public API to create or approve RCS senders — that stays a
 * Console + compliance-review workflow. Once a sender is approved and its SID (XE...)
 * is recorded on the workspace's RCS onboarding state, attaching it to the Messaging
 * Service's sender pool is a public (Public Beta) REST call:
 * POST /v1/Services/{MessagingServiceSid}/ChannelSenders — see
 * https://www.twilio.com/docs/messaging/api/messaging-service-channelsender-resource
 *
 * This is idempotent: it lists the current pool first and no-ops if the sender is
 * already attached.
 */
export async function attachWorkspaceRcsSenderToPool({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<RcsSenderPoolAttachResult> {
  const twilioData = (await loadWorkspaceTwilioData(
    workspaceId,
  )) as unknown as TwilioAccountData;
  const onboarding = getWorkspaceMessagingOnboardingFromTwilioData(twilioData);
  const serviceSid = onboarding.messagingService.serviceSid;
  const rcsSenderId = onboarding.rcs.senderId;

  if (!serviceSid || !rcsSenderId) {
    return {
      serviceSid,
      rcsSenderId,
      attached: false,
      alreadyInPool: false,
    };
  }

  const twilio = await createWorkspaceTwilioClient({
    workspaceId,
  });

  const channelSenders = await listMessagingServiceChannelSenders(
    twilio,
    serviceSid,
    {
      workspaceId,
      operation: "messagingService.channelSenders.list",
    },
  );

  if (channelSenders.some((sender) => sender.sid === rcsSenderId)) {
    invalidateWorkspaceTwilioData(workspaceId);
    return {
      serviceSid,
      rcsSenderId,
      attached: false,
      alreadyInPool: true,
    };
  }

  try {
    await attachChannelSenderToMessagingService(
      twilio,
      serviceSid,
      rcsSenderId,
      {
        workspaceId,
        operation: "messagingService.channelSenders.create",
      },
    );
  } finally {
    invalidateWorkspaceTwilioData(workspaceId);
  }

  return {
    serviceSid,
    rcsSenderId,
    attached: true,
    alreadyInPool: false,
  };
}
