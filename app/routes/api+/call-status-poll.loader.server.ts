import {
  normalizeProviderStatus,
  type CallStatusEnum,
} from "@/lib/call-status";
import { createErrorResponse } from "@/lib/errors.server";
import { createWorkspaceTwilioInstance, requireWorkspaceAccess } from "@/lib/database.server";
import { data as routeData } from "react-router";
import { logger } from "@/lib/logger.server";
import { getSession } from "@/lib/auth.server";
import { requireJsonAuth } from "@/lib/api-auth.server";
import {
  findCallBySid,
  updateCallBySid,
  updateOutreachAttemptForWorkspace,
} from "@/lib/telephony-db.server";
import type { LoaderFunctionArgs } from "react-router";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const auth = await requireJsonAuth(request);
  if (auth instanceof Response) return auth;

  const { headers } = await getSession(request);
  const user = auth.user;

  const url = new URL(request.url);
  const callSid = url.searchParams.get("callSid");
  const workspaceId = url.searchParams.get("workspaceId");

  if (!callSid || !workspaceId) {
    return routeData(
      { error: "Missing callSid or workspaceId" },
      { status: 400, headers },
    );
  }

  const dbCall = await findCallBySid(callSid);

  if (!dbCall?.workspace) {
    logger.debug("Call not found for poll", { callSid });
    return routeData({ error: "Call not found" }, { status: 404, headers });
  }

  if (dbCall.workspace !== workspaceId) {
    return routeData(
      { error: "Call does not belong to this workspace" },
      { status: 403, headers },
    );
  }

  try {
    await requireWorkspaceAccess({ user,
      workspaceId,
    });

    const twilio = await createWorkspaceTwilioInstance({
      workspace_id: dbCall.workspace,
    });

    const twilioCall = await twilio.calls(callSid).fetch();
    const rawStatus = twilioCall.status ?? null;
    const normalizedStatus = normalizeProviderStatus(rawStatus);

    if (normalizedStatus == null) {
      return routeData(
        { status: rawStatus ?? undefined, error: "Unsupported status" },
        { status: 200, headers },
      );
    }

    const currentDbStatus = (dbCall.status ?? null) as CallStatusEnum | null;
    const statusChanged = currentDbStatus !== normalizedStatus;

    if (statusChanged) {
      const now = new Date().toISOString();
      const updatedCall = await updateCallBySid(dbCall.workspace, callSid, {
        status: normalizedStatus,
        date_updated: now,
        ...(twilioCall.endTime
          ? { end_time: new Date(twilioCall.endTime).toISOString() }
          : {}),
        ...(twilioCall.duration != null
          ? { duration: String(twilioCall.duration) }
          : {}),
      });

      if (!updatedCall) {
        logger.error("Error updating call status from poll", { callSid });
        return routeData(
          { status: normalizedStatus, error: "Failed to sync call" },
          { status: 500, headers },
        );
      }

      if (dbCall.outreach_attempt_id != null) {
        const result = await updateOutreachAttemptForWorkspace(
          dbCall.workspace,
          dbCall.outreach_attempt_id,
          { disposition: normalizedStatus },
        );
        if (result instanceof Response) {
          logger.error(
            "Error updating outreach_attempt disposition from poll",
            result.statusText,
          );
        }
      }
    }

    return routeData({ status: normalizedStatus }, { headers });
  } catch (err) {
    logger.error("Error polling call status", err);
    return createErrorResponse(err, "Failed to fetch call status", 500, { headers });
  }
};
