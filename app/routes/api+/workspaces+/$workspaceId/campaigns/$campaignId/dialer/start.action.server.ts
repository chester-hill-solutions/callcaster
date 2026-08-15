import { z } from "zod";
import { parseJsonBodyOrResponse } from "@/lib/api-parse.server";
import { safeRecordWorkspaceAuditEvent } from "@/lib/audit-event.server";
import { dataPlaneCapabilityAuthWithParam } from "@/lib/capability-guard.server";
import { getUserRole } from "@/lib/database/workspace.server";
import { defineAction } from "@/lib/handler.server";
import { MemberRole } from "@/lib/member-role";
import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import {
  autoDialCreditsErrorResponse,
  startAutoDialConference,
} from "@/lib/auto-dial-start.server";
import { hasMinRole } from "@/lib/workspace-route.server";
import type { DataPlaneAuthContextValue } from "@/lib/route-context.server";

const dialerStartBodySchema = z.object({
  caller_id: z.string().min(1),
  selected_device: z.string().min(1),
  agentUserId: z.string().min(1).optional(),
});

async function resolveAgentUserId(
  auth: DataPlaneAuthContextValue,
  workspaceId: string,
  agentUserId: string | undefined,
): Promise<string | Response> {
  if (auth.userId) {
    const role = await getUserRole({
      user: { id: auth.userId },
      workspaceId,
    });
    if (!role || !hasMinRole(role.role, MemberRole.Caller)) {
      return jsonError("Insufficient role", 403);
    }
    return auth.userId;
  }

  if (!agentUserId) {
    return jsonError("agentUserId is required for API key auth", 400);
  }

  const role = await getUserRole({
    user: { id: agentUserId },
    workspaceId,
  });
  if (!role || !hasMinRole(role.role, MemberRole.Caller)) {
    return jsonError("agentUserId is not an authorized caller in this workspace", 403);
  }

  return agentUserId;
}

export const action = defineAction({
  auth: dataPlaneCapabilityAuthWithParam("calls.start", "campaignId"),
  sideEffects: ["db-write", "twilio"],
  handler: async ({ request, auth }) => {
    const campaignId = Number(auth.campaignId);
    if (!Number.isFinite(campaignId)) {
      return jsonError("Invalid campaignId", 400);
    }
    const actorType = auth.auth.userId ? ("session" as const) : ("api_key" as const);
    const actorId = auth.auth.userId;
    const requestId = request.headers.get("x-request-id");

    const parsed = await parseJsonBodyOrResponse(request, dialerStartBodySchema);
    if (parsed instanceof Response) {
      return parsed;
    }

    const agentUserId = await resolveAgentUserId(
      auth.auth,
      auth.workspaceId,
      parsed.agentUserId,
    );
    if (agentUserId instanceof Response) {
      return agentUserId;
    }

    const result = await startAutoDialConference({
      userId: agentUserId,
      workspaceId: auth.workspaceId,
      campaignId,
      callerId: parsed.caller_id,
      selectedDevice: parsed.selected_device,
    });

    if (!result.ok) {
      await safeRecordWorkspaceAuditEvent({
        workspaceId: auth.workspaceId,
        actorType,
        actorId: agentUserId,
        action: "calls.start",
        targetType: "campaign",
        targetId: String(campaignId),
        outcome: "failure",
        requestId,
        metadata: {
          caller_id: parsed.caller_id,
          status: result.status,
        },
      });
      if (result.creditsError) {
        return autoDialCreditsErrorResponse();
      }
      return jsonError(result.error, result.status);
    }

    await safeRecordWorkspaceAuditEvent({
      workspaceId: auth.workspaceId,
      actorType,
      actorId: agentUserId,
      action: "calls.start",
      targetType: "campaign",
      targetId: String(campaignId),
      outcome: "success",
      requestId,
      metadata: {
        caller_id: parsed.caller_id,
        conference_name: result.conferenceName,
      },
    });

    return jsonResponse({ success: true, conferenceName: result.conferenceName }, 200);
  },
});
