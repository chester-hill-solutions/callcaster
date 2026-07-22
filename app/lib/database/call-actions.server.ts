/**
 * Database-backed call/message cancellation actions.
 *
 * Relocated out of the former `database.server.ts` re-export barrel. These
 * functions coordinate Twilio-side cancellation with the local database.
 */
import type Twilio from "twilio";
import { and, eq, inArray } from "drizzle-orm";
import { message as messageTable } from "@/db/schema";
import { adminDb } from "@/server/admin-db";
import { db } from "@/server/db";
import { hangupTwiml } from "@/lib/twilio-twiml.server";
import { logger } from "@/lib/logger.server";
import {
  findActiveConferenceIdsForUser,
  findCallsByConferenceId,
} from "@/lib/telephony-db.server";
import {
  rpcCancelMessages,
  rpcCancelOutreachAttemptsByCallSids,
} from "@/lib/db-rpc.server";
import { createWorkspaceTwilioInstance } from "./workspace.server";

// Marked for deprecation
export async function endConferenceByUser({
  user_id,
  workspace_id,
}: {
  workspace_id: string;
  user_id: string;
}) {
  const twilio = await createWorkspaceTwilioInstance({ workspace_id });
  if (!user_id) {
    throw new Error("User ID is required");
  }

  const conferenceIds = await findActiveConferenceIdsForUser(
    workspace_id,
    user_id,
  );

  await Promise.all(
    conferenceIds.map(async (conferenceId) => {
      try {
        if (conferenceId.startsWith("CF")) {
          await twilio
            .conferences(conferenceId)
            .update({ status: "completed" });
        } else {
          const conferences = await twilio.conferences.list({
            friendlyName: conferenceId,
            status: "in-progress",
          });
          await Promise.all(
            conferences.map(({ sid }) =>
              twilio.conferences(sid).update({ status: "completed" }),
            ),
          );
        }

        const calls = await findCallsByConferenceId(workspace_id, conferenceId);

        await Promise.all(
          calls.map(async (call) => {
            try {
              await twilio.calls(call.sid).update({ twiml: hangupTwiml() });
            } catch (callError) {
              logger.error(`Error updating call ${call.sid}:`, callError);
            }
          }),
        );
      } catch (confError) {
        logger.error(`Error updating conference ${conferenceId}:`, confError);
      }
    }),
  );
}

// Twilio cancellation functions
async function fetchQueuedCalls(twilio: Twilio.Twilio, batchSize: number) {
  return await twilio.calls.list({
    status: "queued",
    limit: batchSize,
    pageSize: batchSize,
  });
}

async function fetchQueuedMessages(twilio: Twilio.Twilio, batchSize: number) {
  return await twilio.messages.list({
    limit: batchSize,
    pageSize: batchSize,
  });
}

async function cancelCallAndUpdateDB(
  twilio: Twilio.Twilio,
  call: { sid: string },
) {
  try {
    const canceledCall = await twilio
      .calls(call.sid)
      .update({ status: "canceled" });
    await rpcCancelOutreachAttemptsByCallSids(db, [canceledCall.sid]);
    return canceledCall.sid;
  } catch (error) {
    throw new Error(
      `Error canceling call ${call.sid}: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

async function cancelMessageAndUpdateDB(
  twilio: Twilio.Twilio,
  message: { sid: string },
) {
  try {
    const cancelledMessage = await twilio
      .messages(message.sid)
      .update({ status: "canceled" });
    await rpcCancelMessages(db, [cancelledMessage.sid]);
    return cancelledMessage.sid;
  } catch (error) {
    throw new Error(
      `Error canceling call ${message.sid}: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

async function processBatchCancellation(
  twilio: Twilio.Twilio,
  calls: { sid: string }[],
) {
  const results = await Promise.allSettled(
    calls.map((call) => cancelCallAndUpdateDB(twilio, call)),
  );

  return results.reduce(
    (acc, result) => {
      if (result.status === "fulfilled") {
        acc.canceledCalls.push(result.value);
      } else {
        acc.errors.push(result.reason.message);
      }
      return acc;
    },
    { canceledCalls: [] as string[], errors: [] as string[] },
  );
}

async function processBatchMessageCancellation(
  twilio: Twilio.Twilio,
  messages: { sid: string }[],
) {
  const results = await Promise.allSettled(
    messages.map((message) => cancelMessageAndUpdateDB(twilio, message)),
  );

  return results.reduce(
    (acc, result) => {
      if (result.status === "fulfilled") {
        acc.cancelledMessages.push(result.value);
      } else {
        acc.errors.push(result.reason.message);
      }
      return acc;
    },
    { cancelledMessages: [] as string[], errors: [] as string[] },
  );
}

export async function cancelQueuedCalls(
  twilio: Twilio.Twilio,
  batchSize = 100,
) {
  let allCanceledCalls = [] as string[];
  let allErrors = [] as string[];
  let hasMoreCalls = true;

  while (hasMoreCalls) {
    try {
      const calls = await fetchQueuedCalls(twilio, batchSize);

      if (calls.length === 0) {
        hasMoreCalls = false;
        break;
      }

      const { canceledCalls, errors } = await processBatchCancellation(
        twilio,
        calls,
      );

      allCanceledCalls = allCanceledCalls.concat(canceledCalls);
      allErrors = allErrors.concat(errors);

      hasMoreCalls = calls.length === batchSize;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      allErrors.push(`Error retrieving calls: ${errorMessage}`);
      hasMoreCalls = false;
    }
  }

  return {
    canceledCalls: allCanceledCalls,
    errors: allErrors,
  };
}

export async function cancelQueuedMessages(
  twilio: Twilio.Twilio,
  batchSize = 100,
) {
  let allCanceledMessages = [] as string[];
  let allErrors = [] as string[];
  let hasMoreMessages = true;

  while (hasMoreMessages) {
    try {
      const messages = await fetchQueuedMessages(twilio, batchSize);

      if (messages.length === 0) {
        hasMoreMessages = false;
        break;
      }

      const { cancelledMessages, errors } =
        await processBatchMessageCancellation(twilio, messages);

      allCanceledMessages = allCanceledMessages.concat(cancelledMessages);
      allErrors = allErrors.concat(errors);

      hasMoreMessages = messages.length === batchSize;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      allErrors.push(`Error retrieving messages: ${errorMessage}`);
      hasMoreMessages = false;
    }
  }
  return {
    canceledMessages: allCanceledMessages,
    errors: allErrors,
  };
}

export async function cancelQueuedMessagesForCampaign(
  twilio: Twilio.Twilio,
  campaignId: number,
  batchSize = 100,
) {
  let allCanceledMessages = [] as string[];
  let allErrors = [] as string[];
  const cancellableStatuses = ["accepted", "scheduled", "queued"] as const;
  let hasMore = true;

  while (hasMore) {
    try {
      const rows = await adminDb
        .select({ sid: messageTable.sid })
        .from(messageTable)
        .where(
          and(
            eq(messageTable.campaign_id, campaignId),
            inArray(messageTable.status, [...cancellableStatuses]),
          ),
        )
        .limit(batchSize);

      const messages = rows.filter(
        (message): message is { sid: string } =>
          typeof message?.sid === "string" && message.sid.length > 0,
      );

      if (messages.length === 0) {
        hasMore = false;
        continue;
      }

      const { cancelledMessages, errors } =
        await processBatchMessageCancellation(twilio, messages);

      allCanceledMessages = allCanceledMessages.concat(cancelledMessages);
      allErrors = allErrors.concat(errors);

      if (messages.length < batchSize) {
        hasMore = false;
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error && error.message
          ? error.message
          : "Unknown error";
      allErrors.push(`Error retrieving messages: ${errorMessage}`);
      hasMore = false;
    }
  }

  return {
    canceledMessages: allCanceledMessages,
    errors: allErrors,
  };
}
