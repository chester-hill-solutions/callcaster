import { describe, expect, test } from "vitest";
import { openApiSpec } from "@/lib/openapi";
import { completeOpenApiSpec } from "@/lib/openapi-complete";

describe("captured queue advance API contract", () => {
  test.each([["public", openApiSpec], ["complete", completeOpenApiSpec]])("%s binds only POST to captured ownership", (_name, spec) => {
    const path = spec.paths["/api/queues"], post = path.post;
    expect(post).toMatchObject({ operationId: "postQueues", "x-callcaster-auth-class": "session", "x-callcaster-exposure": "sessionOnly" });
    expect(post.security).toEqual([{ sessionCookie: [] }, { secureSessionCookie: [] }]);
    expect(post.parameters).toContainEqual(expect.objectContaining({ name: "X-Callcaster-Audio-Actor", in: "header", required: true }));
    const request = post.requestBody.content["application/json"].schema;
    expect(request.required).toEqual(["workspace_id", "campaign_id", "contact_id", "queue_id", "dispatch_generation", "household"]);
    expect(request.additionalProperties).toBe(false);
    expect(request.properties.dispatch_generation).toEqual({ type: "string", format: "uuid" });
    const responses = post.responses["200"].content["application/json"].schema.oneOf;
    expect(responses).toHaveLength(3);
    expect(responses.map(schema => [schema.properties.advance_state.enum[0], schema.properties.dequeued.enum[0]]))
      .toEqual([["dequeued", true], ["already_dequeued", false], ["superseded", false]]);
    expect(responses[2].required).toContain("call_sid");
    for (const status of ["400", "401", "403", "404", "409", "500"]) expect(post.responses).toHaveProperty(status);
    expect(path.get.operationId).toBe("getQueues"); expect(path.delete.operationId).toBe("deleteQueues");
    expect(path.get.parameters ?? []).not.toContainEqual(expect.objectContaining({ name: "X-Callcaster-Audio-Actor" }));
    expect(path.delete.parameters ?? []).not.toContainEqual(expect.objectContaining({ name: "X-Callcaster-Audio-Actor" }));
  });
});
