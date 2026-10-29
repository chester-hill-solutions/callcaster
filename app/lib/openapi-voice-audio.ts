import { errorResponse, rateLimitResponse } from "@/lib/openapi-platform-components";
import { sessionCookieSecurity } from "@/lib/openapi-integrator";

const callSid = { type: "string", pattern: "^CA[0-9a-fA-F]{32}$" };
const workspaceId = { type: "string", format: "uuid" };
const intentId = { type: "string", format: "uuid", description: "Keep this UUID for retries of the same audio change." };
const phoneNumber = { type: "string", pattern: "^\\+[1-9][0-9]{1,14}$", description: "Verified number owned by this user. Outer whitespace is trimmed." };
const liveProperties = { workspaceId, callSid, connection_intent_id: intentId, expected_agent_sid: callSid };
const connectionState = { type: "string", enum: ["prepared", "creating", "joining", "ready", "switching", "active", "retired", "failed", "canceled"] };
const snapshot = {
  type: "object", required: ["connection_id", "connection_state", "callSid", "generation", "transport"],
  properties: {
    connection_id: { type: "string", format: "uuid" }, connection_state: connectionState,
    callSid: { ...callSid, nullable: true }, source_agent_sid: { ...callSid, nullable: true },
    generation: { type: "integer", minimum: 1 }, transport: { type: "string", enum: ["phone", "computer"] },
    cancel_requested: { type: "boolean" },
  },
};
const query = [
  { name: "workspaceId", in: "query", required: true, schema: workspaceId },
  { name: "connection_id", in: "query", required: true, schema: { type: "string", format: "uuid" } },
];

/** Keep this draft outside the platform registry until handoff recovery is complete. */
export const voiceAudioPathOverrides: Record<string, Record<string, unknown>> = {
  "/api/connect-phone-device": {
    post: {
      operationId: "connectAgentAudio", summary: "Connect or replace the agent audio transport",
      "x-callcaster-supported": true, "x-callcaster-exposure": "sessionOnly",
      "x-callcaster-auth-class": "session", "x-callcaster-docs-guide": "docs/api-telephony-control.md",
      security: [...sessionCookieSecurity],
      description: "Session cookie or bearer session only. The device belongs to the signed-in user. Connection is separate from customer dispatch: it does not claim or call the first contact, add a customer debit or take another customer hold. Keep current audio until connection_state is active. Accepted, answered and ready states alone do not prove a completed handoff. Retain the intent UUID on retry; uncertain provider creation is recovered without another create. A manual call issued without a saved parent continuation returns 409 and keeps its existing audio.",
      requestBody: { required: true, content: { "application/json": { schema: { oneOf: [
        { type: "object", additionalProperties: false, required: ["workspaceId", "phoneNumber"], properties: {
          workspaceId, phoneNumber, device: { type: "string", enum: ["phone"] }, connection_intent_id: intentId,
          campaignId: { oneOf: [{ type: "integer", minimum: 1 }, { type: "string", minLength: 1 }], description: "Optional owned idle campaign; a string must parse as a positive integer." },
        } },
        { type: "object", additionalProperties: false, required: ["workspaceId", "phoneNumber", "callSid", "connection_intent_id", "expected_agent_sid"],
          properties: { ...liveProperties, phoneNumber, device: { type: "string", enum: ["phone"] } } },
        { type: "object", additionalProperties: false, required: ["workspaceId", "device", "callSid", "connection_intent_id", "expected_agent_sid"],
          properties: { ...liveProperties, device: { type: "string", enum: ["computer"] } } },
      ] } } } },
      responses: {
        "200": { description: "Agent call accepted or an owned attempt replayed. Check connection_state before changing effective audio.",
          content: { "application/json": { schema: { ...snapshot, required: [...snapshot.required, "success"],
            properties: { ...snapshot.properties, success: { type: "boolean", enum: [true] } } } } } },
        "400": errorResponse("Invalid input or unavailable caller ID"), "401": errorResponse("Unauthorized"),
        "402": errorResponse("Idle connection has no available credits"), "403": errorResponse("Device is not verified for this user"),
        "404": errorResponse("Workspace, user-owned connection or target call not found"),
        "409": errorResponse("Pending operation, stale audio owner, changed provider account or unavailable manual continuation. Current audio stays active."),
        "429": rateLimitResponse, "502": errorResponse("Provider refused the connection"),
      },
    },
    get: {
      operationId: "getAgentAudioConnection", summary: "Read an owned audio connection attempt",
      security: [...sessionCookieSecurity], parameters: query,
      responses: { "200": { description: "Operation state; active requires a verified conference join and completed transport commit.",
        content: { "application/json": { schema: snapshot } } }, "400": errorResponse("Invalid query"),
        "401": errorResponse("Unauthorized"), "404": errorResponse("Connection not found") },
    },
    delete: {
      operationId: "cancelAgentAudioConnection", summary: "Cancel a pending audio replacement or idle connection",
      security: [...sessionCookieSecurity], parameters: query,
      description: "Cancel only this agent transport. An uncertain create remains pending until recovery can stop the accepted leg. This operation cannot hang up or advance a live customer; use the customer hangup or a new audio change for an active live transport.",
      responses: { "200": { description: "Cancellation saved or already complete", content: { "application/json": { schema: snapshot } } },
        "400": errorResponse("Invalid query"), "401": errorResponse("Unauthorized"), "404": errorResponse("Connection not found"),
        "409": errorResponse("Active customer audio must be replaced or ended through the customer control") },
    },
  },
};
