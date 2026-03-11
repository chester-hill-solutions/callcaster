import Twilio from "twilio";
import { createSupabaseServerClient } from "../lib/supabase.server";
import { createWorkspaceTwilioInstance, safeParseJson } from "../lib/database.server";
import { CallInstance } from "twilio/lib/rest/api/v2010/account/call";
import { env } from "@/lib/env.server";
import { logger } from "@/lib/logger.server";

type AutoDialDeps = Partial<{
  createSupabaseServerClient: typeof createSupabaseServerClient;
  safeParseJson: typeof safeParseJson;
  createWorkspaceTwilioInstance: typeof createWorkspaceTwilioInstance;
  env: typeof env;
  logger: typeof logger;
}>;

const resolveDeps = (deps?: AutoDialDeps) => {
  return {
    createSupabaseServerClient: deps?.createSupabaseServerClient ?? createSupabaseServerClient,
    safeParseJson: deps?.safeParseJson ?? safeParseJson,
    createWorkspaceTwilioInstance:
      deps?.createWorkspaceTwilioInstance ?? createWorkspaceTwilioInstance,
    env: deps?.env ?? env,
    logger: deps?.logger ?? logger,
  } as Required<AutoDialDeps>;
};

export const action = async ({
  request,
  deps,
}: {
  request: Request;
  deps?: AutoDialDeps;
}) => {
  const d = resolveDeps(deps);
  const { supabaseClient: supabase } = d.createSupabaseServerClient(request);
  const { user_id, caller_id, campaign_id, workspace_id, selected_device } =
    await d.safeParseJson(request);
  const selectedDevice =
    typeof selected_device === "string" ? selected_device : undefined;
  if (
    typeof user_id !== "string" ||
    typeof caller_id !== "string" ||
    typeof workspace_id !== "string"
  ) {
    return new Response(
      JSON.stringify({ success: false, error: "Missing required auto-dial parameters" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }
  const { data, error } = await supabase
    .from("workspace")
    .select("credits")
    .eq("id", workspace_id)
    .single();
  if (error) throw error;
  const credits = data.credits;
  if (credits <= 0) {
    return {
      creditsError: true,
    };
  }

  const twilio = await d.createWorkspaceTwilioInstance({ supabase, workspace_id });
  const conferenceName = user_id;
  try {
    const call: CallInstance = await twilio.calls.create({
      to:
        selectedDevice && selectedDevice !== "computer"
          ? selectedDevice
          : `client:${user_id}`,
      from: caller_id,
      url: `${d.env.BASE_URL()}/api/auto-dial/${conferenceName}`,
    });

    const callData = {
      sid: call.sid,
      date_updated: call.dateUpdated?.toISOString(),
      parent_call_sid: call.parentCallSid,
      account_sid: call.accountSid,
      from: call.from,
      phone_number_sid: call.phoneNumberSid,
      status: call.status,
      start_time: call.startTime?.toISOString(),
      end_time: call.endTime?.toISOString(),
      duration: call.duration,
      price: call.price,
      direction: call.direction,
      answered_by: call.answeredBy as "human" | "machine" | "unknown" | null,
      api_version: call.apiVersion,
      forwarded_from: call.forwardedFrom,
      group_sid: call.groupSid,
      caller_name: call.callerName,
      uri: call.uri,
      campaign_id: typeof campaign_id === "number" ? campaign_id : null,
      workspace: workspace_id,
      conference_id: user_id,
    };


    Object.keys(callData).forEach(
      (key) =>
        callData[key as keyof typeof callData] === undefined &&
        delete callData[key as keyof typeof callData],
    );
    const { error } = await supabase.from("call").upsert({ ...callData }).select();
    if (error) d.logger.error("Error saving the call to the database:", error);

    return new Response(JSON.stringify({ success: true, conferenceName }), {
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    d.logger.error("Error starting conference:", error);
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      {
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  }
};
