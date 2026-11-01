import { describe, expect, test } from "vitest";
import { openApiSpec } from "@/lib/openapi";
import { completeOpenApiSpec } from "@/lib/openapi-complete";
import { buildOpenApiSpec } from "@/lib/openapi-build";
import { getCompleteOpenApiEntries } from "@/lib/api-surface";
import { voiceAudioSnapshotSchema } from "@/lib/schemas/api/voice-audio";

describe("agent audio OpenAPI view boundaries", () => {
  test.each([["public", openApiSpec], ["complete", completeOpenApiSpec]])("%s preserves predictive Start auth and documents confirmed-phone identity", (_name, spec) => {
    const operation = spec.paths["/api/workspaces/{workspaceId}/campaigns/{campaignId}/dialer/start"].post;
    expect(operation).toMatchObject({ operationId: "startCampaignDialer", "x-callcaster-capability": "calls.start" });
    expect(operation.security).toEqual([{ sessionCookie: [] }, { secureSessionCookie: [] }, { apiKey: [] }]);
    const request = spec.components.schemas.DialerStartRequest;
    expect(request.required).toEqual(["caller_id", "selected_device"]);
    expect(request.oneOf[1].required).toEqual(["audio_connection_id", "audio_generation", "dial_intent_id"]);
    expect(request.oneOf[0].not.anyOf).toEqual([{ required: ["audio_connection_id"] }, { required: ["audio_generation"] }]);
    expect(request.properties.audio_generation.oneOf[0]).toEqual({ type: "integer", minimum: 1 });
    expect(spec.components.schemas.DialerStartResponse.properties.callSid.pattern).toBe("^CA[0-9a-fA-F]{32}$");
    expect(spec.components.schemas.DialerStartResponse.required).toEqual(["success", "conferenceName"]);
  });
  test.each([["public", openApiSpec], ["complete", completeOpenApiSpec]])("%s keeps manual Start identity and both response contracts", (_name, spec) => {
    const operation = spec.paths["/api/dial"].post;
    expect(operation).toMatchObject({ operationId: "postDial", "x-callcaster-auth-class": "session", "x-callcaster-exposure": "sessionOnly" });
    const json = operation.requestBody.content["application/json"].schema;
    expect(json.oneOf).toHaveLength(2);
    expect(json.oneOf[1].required).toEqual(expect.arrayContaining(["selected_device", "dial_intent_id", "audio_connection_id", "audio_generation"]));
    expect(json.oneOf[0].properties).not.toHaveProperty("audio_connection_id");
    expect(operation.requestBody.content["application/x-www-form-urlencoded"].schema).toEqual(json);
    expect(operation.responses["200"].content["application/json"].schema.required).toEqual(["success", "callSid"]);
    expect(operation.responses["200"].content).toHaveProperty("text/xml");
    expect(operation.responses).toHaveProperty("409");
  });
  test("keeps the signed provider endpoint outside the public user API", () => {
    expect(openApiSpec.paths).not.toHaveProperty("/api/voice-audio");
    expect(openApiSpec.paths).not.toHaveProperty("/api/voice-continuation");
    const callback = completeOpenApiSpec.paths["/api/voice-audio"].post;
    expect(callback).toMatchObject({ "x-callcaster-auth-class": "twilioSignature", "x-callcaster-exposure": "providerOnly", "x-callcaster-supported": false });
    expect(callback.parameters).toContainEqual({ name: "X-Twilio-Signature", in: "header", required: true, schema: { type: "string", minLength: 1 } });
    expect(callback.responses).toHaveProperty("204"); expect(callback.responses).toHaveProperty("500");
  });
  test("documents the saved signed parent continuation only in the complete API", () => {
    const operation = completeOpenApiSpec.paths["/api/voice-continuation"].post;
    expect(operation).toMatchObject({ "x-callcaster-auth-class": "twilioSignature", "x-callcaster-exposure": "providerOnly", "x-callcaster-supported": false });
    expect(operation.parameters).toContainEqual({ name: "credit_reservation", in: "query", required: true, schema: { type: "string", format: "uuid" } });
    expect(operation.parameters).toContainEqual({ name: "X-Twilio-Signature", in: "header", required: true, schema: { type: "string", minLength: 1 } });
    expect(operation.responses).toHaveProperty("403"); expect(operation.responses).toHaveProperty("405"); expect(operation.responses).toHaveProperty("500");
  });
  test.each([["public", openApiSpec], ["complete", completeOpenApiSpec]])("%s describes the owned session query and failure states", (_name, spec) => {
    const path = spec.paths["/api/connect-phone-device"];
    const capturedControlParameters = [
      { name: "workspaceId", in: "query", required: true, schema: { type: "string", format: "uuid" } },
      expect.objectContaining({ name: "connection_id", in: "query", required: false, schema: { type: "string", format: "uuid" } }),
      expect.objectContaining({ name: "control_intent_id", in: "query", required: false, schema: expect.objectContaining({ type: "string", format: "uuid" }) }),
      expect.objectContaining({ name: "connection_intent_id", in: "query", required: false, schema: expect.objectContaining({ type: "string", format: "uuid" }) }),
      expect.objectContaining({ name: "X-Callcaster-Audio-Actor", in: "header", required: false }),
    ];
    expect(path.delete.parameters).toEqual(capturedControlParameters);
    expect(path.get.parameters).toEqual([...capturedControlParameters,
      expect.objectContaining({ name: "current", in: "query", required: false, schema: { type: "string", enum: ["1"] } }),
    ]);
    expect(path.delete.responses["200"].content["application/json"].schema.oneOf).toHaveLength(2);
    const readResponses = path.get.responses["200"].content["application/json"].schema.oneOf;
    expect(readResponses).toHaveLength(3);
    const current = readResponses[2];
    expect(current.required).toEqual(["workspace_id", "user_id", "active", "pending", "recovery_required", "customer_pending", "predictive", "manual"]);
    expect(current.properties.manual.required).toEqual(expect.arrayContaining(["call_sid", "agent_call_sid", "provider_status", "dial_intent_id", "attempt", "queue_id", "request"]));
    expect(current.properties.recovery_required.type).toBe("boolean");
    expect(current.properties.customer_pending.type).toBe("boolean");
    const recovery = current.properties.predictive;
    expect(recovery.required).toEqual(["revision", "customer"]);
    expect(recovery.properties.revision).toMatchObject({ type: "string", pattern: "^(0|[1-9][0-9]*)$", maxLength: 19 });
    const customer = recovery.properties.customer;
    expect(customer.nullable).toBe(true);
    expect(customer.required).toEqual(["workspace_id", "user_id", "call_sid", "campaign_id", "contact_id", "outreach_attempt_id", "queue_id", "attempt",
      "conference_id", "conference_sid", "conference_sequence", "human_state"]);
    expect(customer.properties.human_state.enum).toEqual(["pending", "joined"]);
    expect(customer.properties.queue_id).toEqual({ type: "integer", minimum: 1 });
    expect(customer.properties.attempt.required).toEqual(expect.arrayContaining(["id", "workspace", "user_id", "campaign_id", "contact_id", "result", "disposition"]));
    for (const role of ["active", "pending"]) {
      expect(current.properties[role].nullable).toBe(true);
      expect(current.properties[role].required).toEqual(["workspace_id", "user_id", "connection_intent_id", "intent_state", "request", "connection"]);
      expect(current.properties[role].properties.request.required).toEqual(["transport", "destination", "callSid", "expectedAgentSid", "campaignId"]);
      expect(current.properties[role].properties.connection.required).toEqual(expect.arrayContaining([
        "workspace_id", "user_id", "connection_id", "connection_intent_id", "control_intent_id", "source_agent_sid", "requested_call_sid", "campaign_id",
      ]));
    }
    expect(path.post).toMatchObject({ "x-callcaster-auth-class": "session", "x-callcaster-exposure": "sessionOnly" });
    expect(path.post.responses["402"].content["application/json"].schema.required).toEqual(["error", "creditsError"]);
    expect(path.post.responses["200"].content["application/json"].schema.properties.connection_state.enum).toContain("ready");
    expect(path.post.responses["200"].content["application/json"].schema.properties.connection_state.enum).toContain("active");
    for (const method of ["get", "delete", "post"]) {
      const schema = path[method].responses["200"].content["application/json"].schema;
      const response = method === "post" ? schema : schema.oneOf[0];
      expect(response.required).toEqual(expect.arrayContaining(["workspace_id", "user_id", "connection_intent_id", "destination",
        "control_intent_id", "requested_call_sid", "campaign_id", "source_agent_sid", "cancel_requested"]));
      expect(Object.keys(voiceAudioSnapshotSchema.shape)).toEqual(expect.arrayContaining(response.required.filter((field: string) => field !== "success")));
    }
    for (const status of ["409", "502"]) expect(path.post.responses[status].content["application/json"].schema.anyOf[1].required)
      .toEqual(expect.arrayContaining(["error", "connection_id", "connection_intent_id"]));
  });
  test("cannot inject a path absent from the selected API view", () => {
    expect(() => buildOpenApiSpec({ entries: [], title: "Selected fixture", description: "Owned fixture", tagStrategy: "owner",
      pathOverrides: { "/api/voice-audio": { post: { summary: "Unselected provider" } } },
    })).toThrow("Unknown OpenAPI override path");
  });
  test("cannot invent an unregistered method on a selected provider path", () => {
    const entries = getCompleteOpenApiEntries().filter((entry) => entry.path === "/api/voice-audio");
    expect(entries).toHaveLength(1);
    expect(() => buildOpenApiSpec({ entries, title: "Selected fixture", description: "Owned fixture", tagStrategy: "auth",
      pathOverrides: { "/api/voice-audio": { get: { summary: "No provider GET" } } },
    })).toThrow("Unknown OpenAPI override operation");
  });
});
