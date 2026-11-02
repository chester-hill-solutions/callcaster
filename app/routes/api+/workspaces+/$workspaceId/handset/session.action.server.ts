import { createErrorResponse } from "@/lib/errors.server";
import {
  deleteHandsetSessionApi,
  getHandsetSessionApi,
} from "@/lib/platform-telephony.server";
import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import { dataPlaneSessionAuth } from "@/lib/capability-guard.server";
import { defineAction, defineLoader } from "@/lib/handler.server";
import { apiWriteRateLimitResponse } from "@/lib/api-write-rate-limit.server";
import { parseJsonBodyOrResponse } from "@/lib/api-parse.server";
import { handsetDialPreparationBodySchema } from "@/lib/schemas/api/common";
import { prepareHandsetVoiceDial } from "@/server/handset-voice-reservation.server";
import { OUTBOUND_CREDITS_BLOCKED_BODY } from "@/lib/outbound-credit-gate.server";

export const loader = defineLoader({
  auth: dataPlaneSessionAuth(),
  sideEffects: ["db-read"],
  handler: async ({ auth }) => {
    try {
      const result = await getHandsetSessionApi(auth.userId, auth.workspaceId);

      return jsonResponse(
        {
          handset_number: result.handset_number,
          listening: result.listening,
        },
        200,
      );
    } catch (error) {
      return createErrorResponse(error, "Failed to load handset session");
    }
  },
});

export const action = defineAction({
  auth: dataPlaneSessionAuth(),
  sideEffects: ["db-write"],
  handler: async ({ request, auth }) => {
    if (request.method === "POST") {
      const limited = await apiWriteRateLimitResponse({ user: { id: auth.userId } }, "api-voice");
      if (limited) return limited;
      const body = await parseJsonBodyOrResponse(request, handsetDialPreparationBodySchema);
      if (body instanceof Response) return body;
      const result = await prepareHandsetVoiceDial({ workspaceId: auth.workspaceId, userId: auth.userId,
        clientIdentity: body.client_identity, to: body.to_number, intentId: body.dial_intent_id });
      if (result.ok) return jsonResponse({ reservation_id: result.reservation.id, expires_at: result.reservation.lease_expires_at.toISOString() });
      if (result.reason === "insufficient_credits") return jsonResponse(OUTBOUND_CREDITS_BLOCKED_BODY, 402);
      if (result.reason === "workspace_not_found" || result.reason === "handset_not_found") return jsonError("Workspace or handset session not found", 404);
      if (result.reason === "workspace_unavailable") return jsonError("Workspace is not available for outbound calls", 403);
      if (result.reason === "invalid_phone") return jsonError("Invalid phone number", 400);
      if (result.reason === "caller_id_unavailable") return jsonError("No usable caller ID is configured for this workspace", 400);
      return jsonError("This call has already started or is awaiting recovery", 409);
    }
    if (request.method !== "DELETE") {
      return jsonError("Method not allowed", 405);
    }

    try {
      const result = await deleteHandsetSessionApi(auth.userId, auth.workspaceId);

      return jsonResponse({ success: result.success }, 200);
    } catch (error) {
      return createErrorResponse(error, "Failed to end handset session");
    }
  },
});
