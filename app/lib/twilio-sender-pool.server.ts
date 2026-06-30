import type { Database } from "@/lib/db-types";
import {
  getWorkspaceMessagingOnboardingFromTwilioData,
} from "@/lib/messaging-onboarding.server";
import {
  createWorkspaceTwilioClient,
  listMessagingServicePhoneNumbers,
} from "@/lib/twilio-client.server";
import { loadWorkspaceTwilioData } from "@/lib/merge-workspace-twilio-data.server";
import type { TwilioAccountData } from "@/lib/types";

export type SenderPoolVerificationResult = {
  serviceSid: string | null;
  expectedPhoneNumbers: string[];
  livePhoneNumbers: string[];
  missingFromPool: string[];
  extraInPool: string[];
  inSync: boolean;
};

function normalizePhone(phone: string): string {
  return phone.replace(/\s/g, "");
}

export async function verifyWorkspaceMessagingSenderPool({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<SenderPoolVerificationResult> {
  const twilioData = (await loadWorkspaceTwilioData(
    workspaceId,
  )) as unknown as TwilioAccountData;
  const onboarding = getWorkspaceMessagingOnboardingFromTwilioData(twilioData);
  const serviceSid = onboarding.messagingService.serviceSid;
  const expectedPhoneNumbers = onboarding.messagingService.attachedSenderPhoneNumbers.map(
    normalizePhone,
  );

  if (!serviceSid) {
    return {
      serviceSid: null,
      expectedPhoneNumbers,
      livePhoneNumbers: [],
      missingFromPool: [...expectedPhoneNumbers],
      extraInPool: [],
      inSync: expectedPhoneNumbers.length === 0,
    };
  }

  const twilio = await createWorkspaceTwilioClient({
    client: null,
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

  return {
    serviceSid,
    expectedPhoneNumbers,
    livePhoneNumbers,
    missingFromPool,
    extraInPool,
    inSync: missingFromPool.length === 0 && extraInPool.length === 0,
  };
}
