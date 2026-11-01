import { errorResponse } from "@/lib/openapi-platform-components";
import { sessionCookieSecurity } from "@/lib/openapi-integrator";

const numericId = { type: "integer", minimum: 1, maximum: Number.MAX_SAFE_INTEGER };
const requestId = { oneOf: [numericId, { type: "string", pattern: "^[1-9][0-9]*$" }] };
const entryProperties = { queue_id: requestId, contact_id: requestId, dispatch_generation: { type: "string", format: "uuid" },
  voice_reservation_id: { type: "string", format: "uuid", nullable: true } };
const entryRequired = ["queue_id", "contact_id", "dispatch_generation", "voice_reservation_id"];
const householdSnapshot = { type: "object", additionalProperties: false, required: ["household_id", "entries"], properties: {
  household_id: { type: "string", format: "uuid", nullable: true }, entries: { type: "array", maxItems: 1000,
    items: { type: "object", additionalProperties: false, required: entryRequired, properties: entryProperties } } } };
const householdChoice = [{ oneOf: [
  { properties: { household: { enum: [false] } }, not: { required: ["household_snapshot"] } },
  { properties: { household: { enum: [true] } }, required: ["household_snapshot"] },
] }];
const properties = {
  workspace_id: { type: "string", minLength: 1 }, campaign_id: requestId,
  ...entryProperties, household: { type: "boolean" }, household_snapshot: householdSnapshot,
  call_sid: { type: "string", pattern: "^CA[0-9a-fA-F]{32}$", description: "The captured customer Call SID when completing a call. Omit it for an idle manual skip." },
};
const required = ["workspace_id", "campaign_id", "contact_id", "queue_id", "dispatch_generation", "voice_reservation_id", "household"];
function acknowledgement(state: "dequeued" | "already_dequeued" | "superseded") {
  return { type: "object", additionalProperties: false, allOf: householdChoice,
    required: [...required, "success", "user_id", "dequeued", "advance_state", "removed_entries", ...(state === "superseded" ? ["call_sid"] : [])],
    properties: { ...properties, campaign_id: numericId, contact_id: numericId, queue_id: numericId,
      removed_entries: { type: "array", maxItems: state === "superseded" ? 0 : 1001, minItems: state === "superseded" ? 0 : 1,
        items: { type: "object", additionalProperties: false, required: entryRequired, properties: { ...entryProperties, queue_id: numericId, contact_id: numericId } } },
      success: { type: "boolean", enum: [true] }, user_id: { type: "string", minLength: 1 },
      dequeued: { type: "boolean", enum: [state === "dequeued"] }, advance_state: { type: "string", enum: [state] } },
  };
}

export const queueAdvancePathOverrides: Record<string, Record<string, unknown>> = {
  "/api/queues": { post: {
    operationId: "postQueues", summary: "Advance one captured call-screen queue entry",
    "x-callcaster-supported": true, "x-callcaster-exposure": "sessionOnly", "x-callcaster-auth-class": "session",
    "x-callcaster-docs-guide": "docs/api-telephony-control.md", security: [...sessionCookieSecurity],
    description: "Session or bearer session only. Capture workspace, campaign, contact, queue ID and dispatch generation before sending Save and Next. X-Callcaster-Audio-Actor must match the authenticated user; it grants no authority. A customer Call SID must belong to that actor and contact and be terminal. A current funded attempt can dequeue only its own queue generation and reservation. An old terminal customer can finish its view with advance_state=superseded while newer queue work remains unchanged. A legacy completed customer without a saved funding owner also returns superseded; this command does not infer its queue ownership. Idle stale skips return 409. All HTTP 200 variants echo the captured request and actor. Capture voice_reservation_id too, including null. A household action requires the server-provided household_snapshot, including members outside the visible page. Each sibling must still match its captured row, generation, reservation and household; live or newer sibling work stays queued. Remove local rows only when their full identities occur in removed_entries. Superseded returns an empty list. Unknown replies keep the current form; retry the same request. This control does not settle customer billing or start another call.",
    parameters: [{ name: "X-Callcaster-Audio-Actor", in: "header", required: true, schema: { type: "string", minLength: 1 } }],
    requestBody: { required: true, content: { "application/json": { schema: { type: "object", additionalProperties: false, allOf: householdChoice, required, properties },
      example: { workspace_id: "10000000-0000-4000-8000-000000000001", campaign_id: 42, contact_id: 7, queue_id: 27,
        dispatch_generation: "10000000-0000-4000-8000-000000000099", voice_reservation_id: "10000000-0000-4000-8000-000000000088", household: false, call_sid: "CA33333333333333333333333333333333" } } } },
    responses: {
      "200": { description: "The captured action is acknowledged. Only dequeued changes the queue; already_dequeued is an idempotent replay and superseded leaves newer work queued.",
        content: { "application/json": { schema: { oneOf: [acknowledgement("dequeued"), acknowledgement("already_dequeued"), acknowledgement("superseded")] } } } },
      "400": errorResponse("Invalid captured queue identity"), "401": errorResponse("Unauthorized"), "403": errorResponse("Workspace role is not permitted"),
      "404": errorResponse("Workspace or contact is not available"), "409": errorResponse("The actor, queue snapshot or live customer does not match"),
      "405": errorResponse("Method not allowed"), "500": errorResponse("Queue transaction failed; retain the captured request for retry"),
    },
  } },
};
