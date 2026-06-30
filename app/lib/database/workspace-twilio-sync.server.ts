import type Twilio from "twilio";
import type { Database } from "@/lib/db-types";
import { type TwilioAccountData, type WorkspaceTwilioSyncSnapshot } from "../types";
import { logger } from "../logger.server";
import {
  classifyPhoneNumberSenderType,
  classifyTwilioPhoneInventory,
} from "@/lib/twilio-sender-class.server";
import { syncWorkspaceTwilioBootstrapState } from "@/lib/twilio-bootstrap.server";
import {
  listWorkspaceTollFreeVerificationSummaries,
  tollFreeVerificationBlocksBulkSms,
} from "@/lib/twilio-toll-free.server";
import { parseOptionalString } from "@/lib/parse-utils.server";
import { isObject } from "@/lib/type-safety-utils";
import { mergeWorkspaceTwilioData, loadWorkspaceTwilioData } from "@/lib/merge-workspace-twilio-data.server";
import { createWorkspaceTwilioInstance } from "@/lib/database.server";
import { getTwilioUsageDateRange } from "@/lib/twilio-usage";

async function syncWorkspaceTwilioBootstrapStateSafely(args: {
  workspaceId: string;
}) {
  try {
    await syncWorkspaceTwilioBootstrapState(args);
  } catch (error) {
    logger.error("Failed to sync workspace Twilio bootstrap state:", {
      workspaceId: args.workspaceId,
      error,
    });
  }
}

export const DEFAULT_WORKSPACE_TWILIO_SYNC_SNAPSHOT: WorkspaceTwilioSyncSnapshot =
  {
    accountStatus: null,
    accountFriendlyName: null,
    phoneNumberCount: 0,
    numberTypes: [],
    senderTypes: [],
    recentUsageCount: 0,
    usageTotalPrice: null,
    lastSyncedAt: null,
    lastSyncStatus: "never_synced",
    lastSyncError: null,
    tollFreeVerificationBlocked: false,
  };

export function normalizeWorkspaceTwilioSyncSnapshot(
  value: unknown,
): WorkspaceTwilioSyncSnapshot {
  if (!isObject(value)) {
    return { ...DEFAULT_WORKSPACE_TWILIO_SYNC_SNAPSHOT };
  }

  const lastSyncStatus =
    value.lastSyncStatus === "syncing" ||
    value.lastSyncStatus === "healthy" ||
    value.lastSyncStatus === "error" ||
    value.lastSyncStatus === "never_synced"
      ? value.lastSyncStatus
      : DEFAULT_WORKSPACE_TWILIO_SYNC_SNAPSHOT.lastSyncStatus;

  return {
    accountStatus: parseOptionalString(value.accountStatus),
    accountFriendlyName: parseOptionalString(value.accountFriendlyName),
    phoneNumberCount:
      typeof value.phoneNumberCount === "number" ? value.phoneNumberCount : 0,
    numberTypes: Array.isArray(value.numberTypes)
      ? value.numberTypes.filter(
          (item): item is string => typeof item === "string",
        )
      : [],
    senderTypes: Array.isArray(value.senderTypes)
      ? value.senderTypes.filter(
          (item): item is string => typeof item === "string",
        )
      : [],
    recentUsageCount:
      typeof value.recentUsageCount === "number" ? value.recentUsageCount : 0,
    usageTotalPrice:
      typeof value.usageTotalPrice === "number" ? value.usageTotalPrice : null,
    lastSyncedAt: parseOptionalString(value.lastSyncedAt),
    lastSyncStatus,
    lastSyncError: parseOptionalString(value.lastSyncError),
    tollFreeVerificationBlocked:
      typeof value.tollFreeVerificationBlocked === "boolean"
        ? value.tollFreeVerificationBlocked
        : false,
  };
}

export function getWorkspaceTwilioSyncSnapshotFromTwilioData(
  twilioData: TwilioAccountData,
): WorkspaceTwilioSyncSnapshot {
  if (!twilioData || !isObject(twilioData)) {
    return { ...DEFAULT_WORKSPACE_TWILIO_SYNC_SNAPSHOT };
  }

  return normalizeWorkspaceTwilioSyncSnapshot(twilioData.portalSync);
}

async function resolveTollFreeVerificationBlocked(args: {
  twilio: Twilio.Twilio;
  numbers: Array<{ sid?: string; phoneNumber?: string }>;
}): Promise<boolean> {
  const tollFreeNumbers = args.numbers.filter(
    (number) =>
      number.phoneNumber &&
      classifyPhoneNumberSenderType(number.phoneNumber) === "toll_free",
  );

  if (tollFreeNumbers.length === 0) {
    return false;
  }

  const summaries = await listWorkspaceTollFreeVerificationSummaries({
    twilio: args.twilio,
    tollFreePhoneNumbers: tollFreeNumbers,
  });

  return tollFreeVerificationBlocksBulkSms(summaries);
}

export async function updateWorkspaceTwilioSyncSnapshot({
  workspaceId,
  snapshot,
}: {
  workspaceId: string;
  snapshot: WorkspaceTwilioSyncSnapshot;
}) {
  await mergeWorkspaceTwilioData(workspaceId, (currentTwilioData) => ({
    ...currentTwilioData,
    portalSync: normalizeWorkspaceTwilioSyncSnapshot(snapshot),
  }));

  return normalizeWorkspaceTwilioSyncSnapshot(snapshot);
}

export async function syncWorkspaceTwilioSnapshot({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const twilioDataRaw = await loadWorkspaceTwilioData(workspaceId);
  const twilioData = (twilioDataRaw ?? {}) as unknown as TwilioAccountData;
  const sid = typeof twilioData?.sid === "string" ? twilioData.sid : null;
  const authToken =
    typeof twilioData?.authToken === "string" ? twilioData.authToken : null;

  if (!sid || !authToken) {
    const snapshot = await updateWorkspaceTwilioSyncSnapshot({
      workspaceId,
      snapshot: {
        accountStatus: null,
        accountFriendlyName: null,
        phoneNumberCount: 0,
        numberTypes: [],
        senderTypes: [],
        recentUsageCount: 0,
        usageTotalPrice: null,
        lastSyncedAt: new Date().toISOString(),
        lastSyncStatus: "error",
        lastSyncError: "Missing workspace Twilio credentials",
        tollFreeVerificationBlocked: false,
      },
    });
    await syncWorkspaceTwilioBootstrapStateSafely({
      workspaceId,
    });
    return snapshot;
  }

  try {
    const twilio = await createWorkspaceTwilioInstance({       workspace_id: workspaceId,
    });
    const { startDate, endDate } = getTwilioUsageDateRange();
    const [account, numbers, usageRecords] = await Promise.all([
      twilio.api.v2010.accounts(sid).fetch(),
      twilio.incomingPhoneNumbers.list({ limit: 200 }),
      twilio.usage.records.list({
        startDate: new Date(startDate),
        endDate: new Date(endDate),
      }),
    ]);

    const numberTypes = Array.from(
      new Set(
        numbers.flatMap((number) => {
          const detectedTypes: string[] = [];
          if (number.capabilities.sms) detectedTypes.push("sms");
          if (number.capabilities.mms) detectedTypes.push("mms");
          if (number.capabilities.voice) detectedTypes.push("voice");
          return detectedTypes;
        }),
      ),
    );
    const inventory = classifyTwilioPhoneInventory(
      numbers.map((number) => ({
        phoneNumber: number.phoneNumber,
        capabilities: number.capabilities,
      })),
    );

    const usageTotalPrice = usageRecords.reduce((sum, record) => {
      const price = Number(record.price ?? 0);
      return Number.isFinite(price) ? sum + price : sum;
    }, 0);

    const tollFreeVerificationBlocked = await resolveTollFreeVerificationBlocked(
      {
        twilio,
        numbers,
      },
    );

    const snapshot = await updateWorkspaceTwilioSyncSnapshot({
      workspaceId,
      snapshot: {
        accountStatus: account.status,
        accountFriendlyName: account.friendlyName,
        phoneNumberCount: numbers.length,
        numberTypes: inventory.capabilitySummary.length
          ? inventory.capabilitySummary
          : numberTypes,
        senderTypes: inventory.senderTypes,
        recentUsageCount: usageRecords.length,
        usageTotalPrice,
        lastSyncedAt: new Date().toISOString(),
        lastSyncStatus: "healthy",
        lastSyncError: null,
        tollFreeVerificationBlocked,
      },
    });
    await syncWorkspaceTwilioBootstrapStateSafely({
      workspaceId,
    });
    return snapshot;
  } catch (syncError) {
    const snapshot = await updateWorkspaceTwilioSyncSnapshot({
      workspaceId,
      snapshot: {
        accountStatus: null,
        accountFriendlyName: null,
        phoneNumberCount: 0,
        numberTypes: [],
        senderTypes: [],
        recentUsageCount: 0,
        usageTotalPrice: null,
        lastSyncedAt: new Date().toISOString(),
        lastSyncStatus: "error",
        lastSyncError:
          syncError instanceof Error
            ? syncError.message
            : "Unknown Twilio sync failure",
        tollFreeVerificationBlocked: false,
      },
    });
    await syncWorkspaceTwilioBootstrapStateSafely({
      workspaceId,
    });
    return snapshot;
  }
}
