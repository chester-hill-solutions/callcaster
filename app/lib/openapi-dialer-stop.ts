import { errorResponse } from "@/lib/openapi-platform-components";
import { sessionCookieSecurity } from "@/lib/openapi-integrator";

const uuid = { type: "string", format: "uuid" };
const response = (state: "pending" | "stopped") => ({ type: "object",
  required: ["success", "workspace_id", "user_id", "campaign_id", "intent_id", "conference_id", "stop_state"],
  properties: { success: { type: "boolean", enum: [true] }, workspace_id: uuid, user_id: { type: "string", minLength: 1 },
    campaign_id: { type: "integer", minimum: 1 }, intent_id: uuid, conference_id: { type: "string", minLength: 1, nullable: true },
    stop_state: { type: "string", enum: [state] } },
});
export const dialerStopPathOverrides: Record<string, Record<string, unknown>> = {
  "/api/auto-dial/end": { post: {
    operationId: "stopCapturedDialerSession", summary: "Stop one captured dialer Start request",
    "x-callcaster-supported": true, "x-callcaster-exposure": "sessionOnly", "x-callcaster-auth-class": "session",
    security: [...sessionCookieSecurity],
    parameters: [{ name: "X-Callcaster-Audio-Actor", in: "header", required: false, schema: { type: "string", minLength: 1 },
      description: "Must match the signed-in session actor; this is a precondition, never caller-supplied authority." }],
    description: "Capture the original workspace, campaign and dial_intent_id before Start. Stop saves cancellation under the funding workspace lock before provider I/O, even if Start has not reached admission. The same delayed Start cannot create a call. Retry the same Stop until stop_state is stopped; HTTP 202 means cleanup remains pending and does not authorize leaving or clearing the captured request. Cleanup uses the saved original account and exact resources, retains unknown provider creates and credit holds for recovery, and cannot stop a newer Start. A new explicit Start intent remains separate. Stop does not fabricate call outcomes, debit credits or advance another queue generation.",
    requestBody: { required: true, content: { "application/json": { schema: { type: "object", additionalProperties: false,
      required: ["workspaceId", "campaignId", "dial_intent_id"], properties: { workspaceId: uuid,
        campaignId: { oneOf: [{ type: "integer", minimum: 1 }, { type: "string", pattern: "^[1-9][0-9]*$" }] }, dial_intent_id: uuid,
        conferenceName: { type: "string", minLength: 1, description: "Optional captured room precondition after Start is accepted. It never selects a different room." } },
    } } } },
    responses: {
      "200": { description: "This captured request is stopped", content: { "application/json": { schema: response("stopped") } } },
      "202": { description: "Stop is durable; owned provider cleanup is pending", content: { "application/json": { schema: response("pending") } } },
      "400": errorResponse("Invalid captured Stop identity"), "401": errorResponse("Unauthorized"),
      "404": errorResponse("Workspace, campaign or owned request not found"), "409": errorResponse("The captured actor or room changed"),
    },
  } },
};
