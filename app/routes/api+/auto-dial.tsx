import Twilio from "twilio";
import { createSupabaseServerClient } from "../lib/supabase.server";
import {
  createWorkspaceTwilioInstance,
  requireWorkspaceAccess,
  safeParseJson,
} from "../lib/database.server";
import { CallInstance } from "twilio/lib/rest/api/v2010/account/call";
import { env } from "@/lib/env.server";
import { logger } from "@/lib/logger.server";

type AutoDialDeps = Partial<{
  createSupabaseServerClient: typeof createSupabaseServerClient;
  safeParseJson: typeof safeParseJson;
  createWorkspaceTwilioInstance: typeof createWorkspaceTwilioInstance;
  requireWorkspaceAccess: typeof requireWorkspaceAccess;
  getAuthenticatedUser: (
    supabase: ReturnType<typeof createSupabaseServerClient>["supabaseClient"],
  ) => Promise<{ id: string } | null>;
  env: typeof env;
  logger: typeof logger;
}>;

async function defaultGetAuthenticatedUser(
  supabase: ReturnType<typeof createSupabaseServerClient>["supabaseClient"],
): Promise<{ id: string } | null> {
  const authClient = (
    supabase as { auth?: { getUser?: () => Promise<unknown> } }
  ).auth;
  if (!authClient?.getUser) {
    return null;
  }

  const result = (await authClient.getUser()) as {
    data?: { user?: { id?: string } | null };
    error?: unknown;
  };

  const userId = result.data?.user?.id;
  if (typeof userId !== "string" || !userId) {
    return null;
  }

  return { id: userId };
}

const resolveDeps = (deps?: AutoDialDeps) => {
  return {
    createSupabaseServerClient:
      deps?.createSupabaseServerClient ?? createSupabaseServerClient,
    safeParseJson: deps?.safeParseJson ?? safeParseJson,
    createWorkspaceTwilioInstance:
      deps?.createWorkspaceTwilioInstance ?? createWorkspaceTwilioInstance,
    requireWorkspaceAccess:
      deps?.requireWorkspaceAccess ?? requireWorkspaceAccess,
    getAuthenticatedUser:
      deps?.getAuthenticatedUser ?? defaultGetAuthenticatedUser,
    env: deps?.env ?? env,
    logger: deps?.logger ?? logger,
  } as Required<AutoDialDeps>;
};

function buildPendingCallSid(): string {
  const randomSuffix =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.round(Math.random() * 1_000_000)}`;

  return `pending-auto-dial-${randomSuffix}`;
}

export const action = async ({
  request,
  deps,
}: {
  request: Request;
  deps?: AutoDialDeps;
}) => {
  const d = resolveDeps(deps);
  const { supabaseClient: supabase } = d.createSupabaseServerClient(request);
  const {
    user_id: _userIdFromBody,
    caller_id,
    campaign_id,
    workspace_id,
    selected_device,
  } = await d.safeParseJson<{
    user_id?: unknown;
    caller_id?: unknown;
    campaign_id?: unknown;
    workspace_id?: unknown;
    selected_device?: unknown;
  }>(request);

  const authenticatedUser = await d.getAuthenticatedUser(supabase);
  if (!authenticatedUser) {
    return new Response(
      JSON.stringify({ success: false, error: "Unauthorized" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  const selectedDevice =
    typeof selected_device === "string" ? selected_device : undefined;
  if (typeof caller_id !== "string" || typeof workspace_id !== "string") {
    return new Response(
      JSON.stringify({
        success: false,
        error: "Missing required auto-dial parameters",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    await d.requireWorkspaceAccess({
      supabaseClient: supabase,
      user: authenticatedUser,
      workspaceId: workspace_id,
    });
  } catch (error) {
    d.logger.warn("Auto-dial workspace authorization failed", {
      workspace_id,
      userId: authenticatedUser.id,
      error,
    });
    return new Response(
      JSON.stringify({ success: false, error: "Forbidden" }),
      { status: 403, headers: { "Content-Type": "application/json" } },
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

  const twilio = await d.createWorkspaceTwilioInstance({
    supabase,
    workspace_id,
  });
  const conferenceName = authenticatedUser.id;
  const targetDevice =
    selectedDevice && selectedDevice !== "computer"
      ? selectedDevice
      : `client:${authenticatedUser.id}`;
  const pendingCallSid = buildPendingCallSid();

  const { error: pendingInsertError } = await supabase.from("call").insert({
    sid: pendingCallSid,
    from: caller_id,
    to: targetDevice,
    status: "initiated",
    campaign_id: typeof campaign_id === "number" ? campaign_id : null,
    workspace: workspace_id,
    conference_id: authenticatedUser.id,
    direction: "outbound-api",
  });

  if (pendingInsertError) {
    d.logger.error("Error creating pending auto-dial call record", {
      error: pendingInsertError,
      workspace_id,
      conferenceName,
    });
    return new Response(
      JSON.stringify({ success: false, error: "Unable to start call" }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  }

  try {
    const call: CallInstance = await twilio.calls.create({
      to: targetDevice,
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
      conference_id: authenticatedUser.id,
    };

    Object.keys(callData).forEach(
      (key) =>
        callData[key as keyof typeof callData] === undefined &&
        delete callData[key as keyof typeof callData],
    );

    const { error: upsertError } = await supabase
      .from("call")
      .upsert({ ...callData })
      .select();

    if (upsertError) {
      d.logger.error("Error saving the call to the database:", upsertError);

      try {
        await twilio.calls(call.sid).update({ status: "canceled" });
      } catch (cancelError) {
        d.logger.error("Failed to cancel Twilio call after DB upsert failure", {
          callSid: call.sid,
          cancelError,
        });
      }

      await supabase
        .from("call")
        .update({ status: "failed", date_updated: new Date().toISOString() })
        .eq("sid", pendingCallSid);

      return new Response(
        JSON.stringify({
          success: false,
          error: "Unable to persist call state",
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
    }

    const { error: pendingDeleteError } = await supabase
      .from("call")
      .delete()
      .eq("sid", pendingCallSid);

    if (pendingDeleteError) {
      d.logger.warn("Failed to remove pending auto-dial call record", {
        pendingCallSid,
        error: pendingDeleteError,
      });
    }

    return new Response(JSON.stringify({ success: true, conferenceName }), {
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    await supabase
      .from("call")
      .update({ status: "failed", date_updated: new Date().toISOString() })
      .eq("sid", pendingCallSid);

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
