import {
  createWorkspaceTwilioInstance,
  requireWorkspaceAccess,
  safeParseJson,
} from "@/lib/database.server";
import { CallInstance } from "twilio/lib/rest/api/v2010/account/call";
import { eq } from "drizzle-orm";
import { call as callTable } from "@/db/schema";
import { getSession } from "@/lib/auth.server";
import { insertCallForWorkspace, updateCallBySid } from "@/lib/telephony-db.server";
import { getWorkspaceCreditsBalance } from "@/lib/workspace-credits.server";
import { createTenantDb } from "@/server/tenant-db";
import { env } from "@/lib/env.server";
import { logger } from "@/lib/logger.server";
import { withTwilioRetry } from "@/lib/twilio-client.server";
import type TwilioSDK from "twilio";

type TwilioClient = TwilioSDK.Twilio;

type AutoDialDeps = Partial<{
  getSession: typeof getSession;
  safeParseJson: <T>(request: Request) => Promise<T>;
  createWorkspaceTwilioInstance: (args: {
    workspace_id: string;
  }) => Promise<TwilioClient>;
  requireWorkspaceAccess: (args: {
    user: { id: string };
    workspaceId: string;
  }) => Promise<void>;
  env: typeof env;
  logger: typeof logger;
}>;

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
  const d = {
    getSession: deps?.getSession ?? getSession,
    safeParseJson: deps?.safeParseJson ?? safeParseJson,
    createWorkspaceTwilioInstance:
      deps?.createWorkspaceTwilioInstance ?? createWorkspaceTwilioInstance,
    requireWorkspaceAccess:
      deps?.requireWorkspaceAccess ?? requireWorkspaceAccess,
    env: deps?.env ?? env,
    logger: deps?.logger ?? logger,
  };

  const { user } = await d.getSession(request);
  if (!user) {
    return new Response(
      JSON.stringify({ success: false, error: "Unauthorized" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

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

  const authenticatedUser = user;
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

  const credits = await getWorkspaceCreditsBalance(workspace_id);
  if (credits === null) {
    throw new Error(`Workspace ${workspace_id} not found`);
  }
  if (credits <= 0) {
    return {
      creditsError: true,
    };
  }

  const twilio = await d.createWorkspaceTwilioInstance({ workspace_id });
  const conferenceName = authenticatedUser.id;
  const targetDevice =
    selectedDevice && selectedDevice !== "computer"
      ? selectedDevice
      : `client:${authenticatedUser.id}`;
  const pendingCallSid = buildPendingCallSid();

  const pendingRow = await insertCallForWorkspace(workspace_id, {
    sid: pendingCallSid,
    from: caller_id,
    to: targetDevice,
    status: "initiated",
      campaign_id: typeof campaign_id === "number" ? campaign_id : undefined,
      conference_id: authenticatedUser.id,
    direction: "outbound-api",
  });

  if (!pendingRow) {
    d.logger.error("Error creating pending auto-dial call record", {
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
    const call: CallInstance = await withTwilioRetry(
      () =>
        twilio.calls.create({
          to: targetDevice,
          from: caller_id,
          url: `${d.env.BASE_URL()}/api/auto-dial/${conferenceName}`,
        }),
      { workspaceId: workspace_id, operation: "calls.create" },
    );

    const savedCall = await insertCallForWorkspace(workspace_id, {
      sid: call.sid,
      date_updated: call.dateUpdated?.toISOString() ?? null,
      parent_call_sid: call.parentCallSid ?? null,
      account_sid: call.accountSid ?? null,
      from: call.from ?? null,
      to: call.to ?? null,
      phone_number_sid: call.phoneNumberSid ?? null,
      status: call.status ?? null,
      start_time: call.startTime?.toISOString() ?? null,
      end_time: call.endTime?.toISOString() ?? null,
      duration: call.duration ?? null,
      price: call.price ?? null,
      direction: call.direction ?? null,
      answered_by: (call.answeredBy as "human" | "machine" | "unknown" | null) ?? null,
      api_version: call.apiVersion ?? null,
      forwarded_from: call.forwardedFrom ?? null,
      group_sid: call.groupSid ?? null,
      caller_name: call.callerName ?? null,
      uri: call.uri ?? null,
    campaign_id: typeof campaign_id === "number" ? campaign_id : undefined,
      conference_id: authenticatedUser.id,
    });

    if (!savedCall) {
      d.logger.error("Error saving the call to the database:", { callSid: call.sid });

      try {
        await withTwilioRetry(
          () => twilio.calls(call.sid).update({ status: "canceled" }),
          { workspaceId: workspace_id, operation: "calls.update" },
        );
      } catch (cancelError) {
        d.logger.error("Failed to cancel Twilio call after DB upsert failure", {
          callSid: call.sid,
          cancelError,
        });
      }

      await updateCallBySid(workspace_id, pendingCallSid, {
        status: "failed",
        date_updated: new Date().toISOString(),
      });

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

    const tdb = createTenantDb(workspace_id);
    try {
      await tdb.call.delete({ where: eq(callTable.sid, pendingCallSid) });
    } catch (pendingDeleteError) {
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
    await updateCallBySid(workspace_id, pendingCallSid, {
      status: "failed",
      date_updated: new Date().toISOString(),
    });

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
