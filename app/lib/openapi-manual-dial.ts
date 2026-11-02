import { errorResponse, rateLimitResponse } from "@/lib/openapi-platform-components";
import { sessionCookieSecurity } from "@/lib/openapi-integrator";

const id = { type: "string", pattern: "^[1-9][0-9]*$" };
const intent = { type: "string", format: "uuid" };
const properties = {
  to_number: { type: "string", minLength: 1 }, caller_id: { type: "string", minLength: 1 },
  workspace_id: { type: "string", format: "uuid" }, user_id: { type: "string", minLength: 1 },
  campaign_id: id, contact_id: id, queue_id: id, outreach_id: { type: "string", description: "Positive attempt ID or an empty value to create an attempt." },
  selected_device: { type: "string" }, dial_intent_id: intent, expected_queue_generation: intent,
};
const required = ["to_number", "caller_id", "workspace_id", "user_id", "campaign_id", "contact_id", "queue_id"];
const request = { oneOf: [
  { type: "object", additionalProperties: false, properties, required },
  { type: "object", additionalProperties: false, required: [...required, "selected_device", "dial_intent_id", "audio_connection_id", "audio_generation"],
    properties: { ...properties, selected_device: { type: "string", pattern: "^\\+[1-9][0-9]{7,14}$" }, audio_connection_id: intent,
      audio_generation: { oneOf: [{ type: "integer", minimum: 1 }, { type: "string", pattern: "^[1-9][0-9]*$" }] } } },
] };

export const manualDialPathOverrides: Record<string, Record<string, unknown>> = {
  "/api/dial": { post: {
    operationId: "postDial", summary: "Start one funded manual customer call",
    "x-callcaster-supported": true, "x-callcaster-exposure": "sessionOnly", "x-callcaster-auth-class": "session",
    "x-callcaster-docs-guide": "docs/api-telephony-control.md", security: [...sessionCookieSecurity],
    description: "Session or bearer session only. user_id must be the actor. Queue/contact/campaign/outreach and the selected device are owned. Keep dial_intent_id for retries. Optional audio_connection_id and audio_generation reuse the actor's confirmed idle phone; both fields, a verified phone selected_device and dial_intent_id are required together. Explicit Start calls only the customer with one hold and returns its real SID as JSON. Accepted intent replay precedes mutable source checks. Connect remains connection-only. A new legacy phone setup is refused while this actor has an unresolved audio connection. Without an owned audio operation, legacy requests retain setup-plus-recipient behavior and TwiML success.",
    requestBody: { required: true, content: { "application/json": { schema: request }, "application/x-www-form-urlencoded": { schema: request } } },
    responses: {
      "200": { description: "Accepted call or accepted intent replay. Confirmed-phone requests return JSON; legacy requests return TwiML.", content: {
        "application/json": { schema: { type: "object", required: ["success", "callSid"], properties: {
          success: { type: "boolean", enum: [true] }, callSid: { type: "string", pattern: "^CA[0-9a-fA-F]{32}$" },
        } } }, "text/xml": { schema: { type: "string" } },
      } }, "400": errorResponse("Invalid dial context"), "401": errorResponse("Unauthorized"),
      "402": errorResponse("Insufficient available credits"), "403": errorResponse("Selected actor or device is not permitted"),
      "404": errorResponse("Workspace or dial context not found"), "409": errorResponse("Pending call, stale queue/source, or provider verification required"),
      "429": rateLimitResponse, "502": errorResponse("Provider rejected the call"),
    },
  } },
};
