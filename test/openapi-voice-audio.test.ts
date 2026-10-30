import { describe, expect, test } from "vitest";
import { openApiSpec } from "@/lib/openapi";
import { completeOpenApiSpec } from "@/lib/openapi-complete";
import { buildOpenApiSpec } from "@/lib/openapi-build";
import { getCompleteOpenApiEntries } from "@/lib/api-surface";

describe("agent audio OpenAPI view boundaries", () => {
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
    for (const method of ["get", "delete"]) expect(path[method].parameters).toEqual([
      { name: "workspaceId", in: "query", required: true, schema: { type: "string", format: "uuid" } },
      { name: "connection_id", in: "query", required: true, schema: { type: "string", format: "uuid" } },
    ]);
    expect(path.post).toMatchObject({ "x-callcaster-auth-class": "session", "x-callcaster-exposure": "sessionOnly" });
    expect(path.post.responses["402"].content["application/json"].schema.required).toEqual(["error", "creditsError"]);
    expect(path.post.responses["200"].content["application/json"].schema.properties.connection_state.enum).toContain("ready");
    expect(path.post.responses["200"].content["application/json"].schema.properties.connection_state.enum).toContain("active");
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
