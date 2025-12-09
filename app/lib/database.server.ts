/**
 * Database server functions - Re-exports from modular files
 * 
 * This file maintains backward compatibility by re-exporting all functions
 * from the modular database files. New code should import directly from
 * the module files (e.g., ~/lib/database/workspace.server.ts)
 */

// Re-export workspace functions
export {
  getUserWorkspaces,
  createKeys,
  createSubaccount,
  createNewWorkspace,
  getWorkspaceInfo,
  getWorkspaceInfoWithDetails,
  getWorkspaceCampaigns,
  getWorkspaceUsers,
  getWorkspacePhoneNumbers,
  updateWorkspacePhoneNumber,
  addUserToWorkspace,
  getUserRole,
  updateUserWorkspaceAccessDate,
  handleExistingUserSession,
  handleNewUserOTPVerification,
  forceTokenRefresh,
  createWorkspaceTwilioInstance,
  removeWorkspacePhoneNumber,
  updateCallerId,
  fetchWorkspaceData,
  getWorkspaceScripts,
  getRecordingFileNames,
  getMedia,
  listMedia,
  getSignedUrls,
  acceptWorkspaceInvitations,
  getInvitesByUserId,
  fetchConversationSummary,
  type WorkspaceInfoWithDetails,
} from "./database/workspace.server";

// Re-export campaign functions
export {
  updateCampaign,
  deleteCampaign,
  createCampaign,
  updateOrCopyScript,
  updateCampaignScript,
  fetchBasicResults,
  fetchCampaignCounts,
  fetchCampaignData,
  fetchCampaignDetails,
  fetchQueueCounts,
  fetchCampaignAudience,
  fetchAdvancedCampaignDetails,
  fetchCampaignsByType,
  getCampaignQueueById,
  checkSchedule,
  fetchOutreachData,
  processOutreachExportData,
  getCampaignTableKey,
  type CampaignType,
  type CampaignData,
  type CampaignDetails,
  type OutreachExportData,
} from "./database/campaign.server";

// Re-export contact functions
export {
  findPotentialContacts,
  fetchContactData,
  updateContact,
  createContact,
  bulkCreateContacts,
} from "./database/contact.server";

// Re-export Stripe functions
export {
  createStripeContact,
  meterEvent,
} from "./database/stripe.server";

// Re-export utility functions that are still used
import { json } from "@remix-run/node";
import { logger } from "./logger.server";

export const parseRequestData = async (request: Request) => {
  const contentType = request.headers.get("Content-Type");
  if (!contentType) return;
  if (contentType === "application/json") {
    return await request.json();
  } else if (contentType.startsWith("application/x-www-form-urlencoded")) {
    const formData = await request.formData();
    return Object.fromEntries(formData);
  }
  throw new Error("Unsupported content type");
};

export const handleError = (error: Error, message: string, status = 500) => {
  logger.error(`${message}:`, error);
  return json({ error: message }, { status });
};

// Legacy functions that need to be kept for now
import Twilio from "twilio";
import { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

// Marked for deprecation
export async function endConferenceByUser({
  user_id,
  supabaseClient,
  workspace_id,
}: {
  workspace_id: string;
  user_id: string;
  supabaseClient: SupabaseClient;
}) {
  const { data, error } = await supabaseClient
    .from("workspace")
    .select("twilio_data, key, token")
    .eq("id", workspace_id)
    .single();
  if (error || !data) {
    throw error || new Error("No workspace found");
  }
  const twilio = new Twilio.Twilio(
    data.twilio_data.sid,
    data.twilio_data.authToken,
  );
  if (!user_id) {
    throw new Error("User ID is required");
  }
  const conferences = await twilio.conferences.list({
    friendlyName: user_id,
    status: ["in-progress"],
  });

  await Promise.all(
    conferences.map(async (conf) => {
      try {
        await twilio.conferences(conf.sid).update({ status: "completed" });

        const { data, error } = await supabaseClient
          .from("call")
          .select("sid")
          .eq("conference_id", conf.sid);
        if (error) throw error;

        await Promise.all(
          data.map(async (call) => {
            try {
              await twilio
                .calls(call.sid)
                .update({ twiml: `<Response><Hangup/></Response>` });
            } catch (callError) {
              logger.error(`Error updating call ${call.sid}:`, callError);
            }
          }),
        );
      } catch (confError) {
        logger.error(`Error updating conference ${conf.sid}:`, confError);
      }
    }),
  );
}

// Twilio cancellation functions
async function fetchQueuedCalls(twilio: typeof Twilio, batchSize: number) {
  return await twilio.calls.list({
    status: "queued",
    limit: batchSize,
    pageSize: batchSize,
  });
}

async function fetchQueuedMessages(twilio: typeof Twilio, batchSize: number) {
  return await twilio.messages.list({
    status: "queued",
    limit: batchSize,
    pageSize: batchSize,
  });
}

async function cancelCallAndUpdateDB(
  twilio: typeof Twilio,
  supabase: SupabaseClient<Database>,
  call: { sid: string },
) {
  try {
    const canceledCall = await twilio
      .calls(call.sid)
      .update({ status: "canceled" });
    await supabase.rpc("cancel_outreach_attempts", {
      in_call_sid: canceledCall.sid,
    });
    return canceledCall.sid;
  } catch (error) {
    throw new Error(
      `Error canceling call ${call.sid}: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

async function cancelMessageAndUpdateDB(
  twilio: typeof Twilio,
  supabase: SupabaseClient<Database>,
  message: { sid: string },
) {
  try {
    const cancelledMessage = await twilio
      .messages(message.sid)
      .update({ status: "canceled" });
    await supabase.rpc("cancel_messages", {
      message_ids: cancelledMessage.sid,
    });
    return cancelledMessage.sid;
  } catch (error) {
    throw new Error(
      `Error canceling call ${message.sid}: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

async function processBatchCancellation(twilio: typeof Twilio, supabase: SupabaseClient<Database>, calls: { sid: string }[]) {
  const results = await Promise.allSettled(
    calls.map((call) => cancelCallAndUpdateDB(twilio, supabase, call)),
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
  twilio: typeof Twilio,
  supabase: SupabaseClient<Database>,
  messages: { sid: string }[],
) {
  const results = await Promise.allSettled(
    messages.map((message) =>
      cancelMessageAndUpdateDB(twilio, supabase, message),
    ),
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
  twilio: typeof Twilio,
  supabase: SupabaseClient<Database>,
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
        supabase,
        calls,
      );

      allCanceledCalls = allCanceledCalls.concat(canceledCalls);
      allErrors = allErrors.concat(errors);

      hasMoreCalls = calls.length === batchSize;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
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
  twilio: typeof Twilio,
  supabase: SupabaseClient<Database>,
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

      const { cancelledMessages, errors } = await processBatchMessageCancellation(
        twilio,
        supabase,
        messages,
      );

      allCanceledMessages = allCanceledMessages.concat(cancelledMessages);
      allErrors = allErrors.concat(errors);

      hasMoreMessages = messages.length === batchSize;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      allErrors.push(`Error retrieving messages: ${errorMessage}`);
      hasMoreMessages = false;
    }
  }
  return {
    canceledMessages: allCanceledMessages,
    errors: allErrors,
  };
}
