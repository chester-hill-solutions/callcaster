import { createClient } from "npm:@supabase/supabase-js@^2.39.6";
import Twilio from "npm:twilio@^5.3.0";
import { getFunctionsBaseUrl } from "../_shared/getFunctionsBaseUrl.ts";
import { readTwilioWorkspaceCredentials } from "../_shared/twilio-workspace-credentials.ts";
import {
  completeQueueContact,
  failQueueContact,
  requeueContact,
} from "../_shared/campaign-dispatch.ts";
import { jsonHandlerResponse } from "../_shared/handler-response.ts";
import {
  isRetryableVoiceTwilioError,
  withTwilioRetry,
} from "../_shared/twilio-retry.ts";

const baseUrl = getFunctionsBaseUrl();

interface RequestBody {
  to_number: string;
  campaign_id: string;
  workspace_id: string;
  contact_id: string;
  caller_id: string;
  queue_id?: number;
  user_id?: string;
  index?: number;
  total?: number;
  isLastContact?: boolean;
  type: string;
  owner: string;
}

async function getTwilioData(supabase: ReturnType<typeof createClient>, workspace_id: string) {
  const { data: workspace, error: workspaceError } = await supabase
    .from("workspace")
    .select("twilio_data")
    .eq("id", workspace_id)
    .single();

  if (workspaceError || !workspace) {
    return null;
  }
  return workspace.twilio_data;
}

async function createOutreachAttempt(
  supabase: ReturnType<typeof createClient>,
  body: RequestBody,
) {
  const { data: outreachAttemptId, error: outreachError } = await supabase.rpc(
    "create_outreach_attempt",
    {
      con_id: body.contact_id,
      cam_id: body.campaign_id,
      wks_id: body.workspace_id,
      queue_id: body.queue_id,
      usr_id: body.user_id,
    },
  );

  if (outreachError) {
    console.error("Error creating outreach attempt:", outreachError.message);
    return null;
  }
  return outreachAttemptId;
}

async function markOutreachFailed(
  supabase: ReturnType<typeof createClient>,
  outreachAttemptId: string | number | null,
) {
  if (!outreachAttemptId) return;
  await supabase
    .from("outreach_attempt")
    .update({ disposition: "failed" })
    .eq("id", outreachAttemptId);
}

export async function handleRequest(req: Request): Promise<Response> {
  try {
    const body: RequestBody = await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const outreach_attempt_id = await createOutreachAttempt(supabase, body);
    if (!outreach_attempt_id) {
      return jsonHandlerResponse("permanent_failure", {
        error: "Outreach creation failed",
      });
    }

    const twilio_data = await getTwilioData(supabase, body.workspace_id);
    const creds = readTwilioWorkspaceCredentials(twilio_data);
    if (!twilio_data || !creds) {
      await markOutreachFailed(supabase, outreach_attempt_id);
      return jsonHandlerResponse("permanent_failure", {
        error: "Twilio data retrieval failed",
      });
    }

    try {
      const twilio = new Twilio(creds.sid, creds.authToken);
      const call = await withTwilioRetry(
        () =>
          twilio.calls.create({
            to: body.to_number,
            from: body.caller_id,
            url: `${baseUrl}/ivr-flow`,
            machineDetection: "DetectMessageEnd",
            machineDetectionSpeechThreshold: 1900,
            machineDetectionSpeechEndThreshold: 1200,
            statusCallbackEvent: ["initiated", "answered", "completed"],
            statusCallback: `${baseUrl}/ivr-status`,
          }),
        {
          operation: "calls.create",
          isRetryable: isRetryableVoiceTwilioError,
        },
      );

      const { error: insertError } = await supabase
        .from("call")
        .insert({
          sid: call.sid,
          to: body.to_number,
          from: body.caller_id,
          campaign_id: body.campaign_id,
          contact_id: body.contact_id,
          workspace: body.workspace_id,
          outreach_attempt_id: outreach_attempt_id,
          queue_id: body.queue_id,
          is_last: body.isLastContact,
        });

      if (insertError) {
        await twilio.calls(call.sid).update({ status: "canceled" });
        await markOutreachFailed(supabase, outreach_attempt_id);
        if (body.queue_id) {
          await failQueueContact({
            supabase,
            queueId: body.queue_id,
            errorText: "Failed to insert call record",
            dequeuedById: body.user_id ?? body.owner ?? null,
          });
        }
        return jsonHandlerResponse("permanent_failure", {
          error: "Failed to insert call record",
        });
      }

      if (body.queue_id) {
        await completeQueueContact({
          supabase,
          queueId: body.queue_id,
          dequeuedById: body.user_id ?? body.owner ?? null,
          reason: "IVR call initiated",
        });
      }

      return jsonHandlerResponse("success");
    } catch (error) {
      await markOutreachFailed(supabase, outreach_attempt_id);
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (body.queue_id) {
        if (isRetryableVoiceTwilioError(error)) {
          await requeueContact({
            supabase,
            queueId: body.queue_id,
            errorText: errorMessage.slice(0, 500),
          });
          return jsonHandlerResponse("retryable_failure", { error: errorMessage });
        }

        await failQueueContact({
          supabase,
          queueId: body.queue_id,
          errorText: errorMessage.slice(0, 500),
          dequeuedById: body.user_id ?? body.owner ?? null,
        });
      }

      return jsonHandlerResponse("permanent_failure", { error: errorMessage });
    }
  } catch (error) {
    console.error("Error processing call:", error);
    const errorMessage = error instanceof Error ? error.message : "Internal server error";
    return jsonHandlerResponse("permanent_failure", { error: errorMessage });
  }
}

if (import.meta.main) {
  Deno.serve(handleRequest);
}
