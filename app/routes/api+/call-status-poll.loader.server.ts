import type { LoaderFunctionArgs } from "react-router";
import type { Database, Tables } from "@/lib/database.types";
import { data as routeData } from "react-router";
import { createClient } from "@supabase/supabase-js";
import {
  normalizeProviderStatus,
  type CallStatusEnum,
} from "@/lib/call-status";
import { data as routeData } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { createWorkspaceTwilioInstance, requireWorkspaceAccess } from "@/lib/database.server";
import { env } from "@/lib/env.server";
import { createErrorResponse } from "@/lib/errors.server";
import { logger } from "@/lib/logger.server";
import { verifyAuth } from "@/lib/supabase.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {





  const { supabaseClient: userSupabase, headers, user } = await verifyAuth(
    request,
    "/signin"
  );

  if (!user) {
    return routeData({ error: "Unauthorized" }, { status: 401, headers });
  }

  const url = new URL(request.url);
  const callSid = url.searchParams.get("callSid");
  const workspaceId = url.searchParams.get("workspaceId");

  if (!callSid || !workspaceId) {
    return routeData(
      { error: "Missing callSid or workspaceId" },
      { status: 400, headers }
    );
  }

  const serviceSupabase = createClient<Database>(
    env.SUPABASE_URL(),
    env.SUPABASE_SERVICE_KEY()
  );

  const { data: dbCall, error: callError } = await serviceSupabase
    .from("call")
    .select("sid, workspace, outreach_attempt_id, status")
    .eq("sid", callSid)
    .single();

  if (callError || !dbCall) {
    logger.debug("Call not found for poll", { callSid, error: callError?.message });
    return routeData({ error: "Call not found" }, { status: 404, headers });
  }

  if (dbCall.workspace !== workspaceId) {
    return routeData(
      { error: "Call does not belong to this workspace" },
      { status: 403, headers }
    );
  }

  try {
    await requireWorkspaceAccess({
      supabaseClient: userSupabase,
      user,
      workspaceId,
    });

    const twilio = await createWorkspaceTwilioInstance({
      supabase: serviceSupabase,
      workspace_id: dbCall.workspace,
    });

    const twilioCall = await twilio.calls(callSid).fetch();
    const rawStatus = twilioCall.status ?? null;
    const normalizedStatus = normalizeProviderStatus(rawStatus);

    if (normalizedStatus == null) {
      return routeData(
        { status: rawStatus ?? undefined, error: "Unsupported status" },
        { status: 200, headers }
      );
    }

    const currentDbStatus = (dbCall.status ?? null) as CallStatusEnum | null;
    const statusChanged =
      currentDbStatus !== normalizedStatus;

    if (statusChanged) {
      const now = new Date().toISOString();
      const { error: updateCallError } = await serviceSupabase
        .from("call")
        .update({
          status: normalizedStatus,
          date_updated: now,
          ...(twilioCall.endTime
            ? { end_time: new Date(twilioCall.endTime).toISOString() }
            : {}),
          ...(twilioCall.duration != null
            ? { duration: String(twilioCall.duration) }
            : {}),
        } as Partial<Tables<"call">>)
        .eq("sid", callSid);

      if (updateCallError) {
        logger.error("Error updating call status from poll", updateCallError);
        return routeData(
          { status: normalizedStatus, error: "Failed to sync call" },
          { status: 500, headers }
        );
      }

      if (dbCall.outreach_attempt_id != null) {
        const { error: updateAttemptError } = await serviceSupabase
          .from("outreach_attempt")
          .update({ disposition: normalizedStatus })
          .eq("id", dbCall.outreach_attempt_id);

        if (updateAttemptError) {
          logger.error(
            "Error updating outreach_attempt disposition from poll",
            updateAttemptError
          );
        }
      }
    }

    return routeData({ status: normalizedStatus }, { headers });
  } catch (err) {
    logger.error("Error polling call status", err);
    return createErrorResponse(err, "Failed to fetch call status", 500, { headers });
  }
}
