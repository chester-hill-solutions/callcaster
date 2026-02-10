import { createClient } from "@supabase/supabase-js";
import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import type { Database, Tables } from "@/lib/database.types";
import { createWorkspaceTwilioInstance } from "@/lib/database.server";
import { verifyAuth } from "@/lib/supabase.server";
import { env } from "@/lib/env.server";
import { logger } from "@/lib/logger.server";
import {
  normalizeProviderStatus,
  type CallStatusEnum,
} from "@/lib/call-status";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { supabaseClient: userSupabase, headers, user } = await verifyAuth(
    request,
    "/signin"
  );

  if (!user) {
    return json({ error: "Unauthorized" }, { status: 401, headers });
  }

  const url = new URL(request.url);
  const callSid = url.searchParams.get("callSid");
  const workspaceId = url.searchParams.get("workspaceId");

  if (!callSid || !workspaceId) {
    return json(
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
    .select("id, sid, workspace, outreach_attempt_id, status")
    .eq("sid", callSid)
    .single();

  if (callError || !dbCall) {
    logger.debug("Call not found for poll", { callSid, error: callError?.message });
    return json({ error: "Call not found" }, { status: 404, headers });
  }

  if (dbCall.workspace !== workspaceId) {
    return json(
      { error: "Call does not belong to this workspace" },
      { status: 403, headers }
    );
  }

  const { data: membership } = await userSupabase
    .from("workspace")
    .select("id")
    .eq("id", workspaceId)
    .maybeSingle();

  if (!membership) {
    return json(
      { error: "Workspace access denied" },
      { status: 403, headers }
    );
  }

  try {
    const twilio = await createWorkspaceTwilioInstance({
      supabase: serviceSupabase,
      workspace_id: dbCall.workspace,
    });

    const twilioCall = await twilio.calls(callSid).fetch();
    const rawStatus = twilioCall.status ?? null;
    const normalizedStatus = normalizeProviderStatus(rawStatus);

    if (normalizedStatus == null) {
      return json(
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
        return json(
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

    return json({ status: normalizedStatus }, { headers });
  } catch (err) {
    logger.error("Error polling call status", err);
    return json(
      { error: err instanceof Error ? err.message : "Failed to fetch call status" },
      { status: 500, headers }
    );
  }
};
