import { describe, expect, test } from "vitest";

import { openApiSpec } from "../app/lib/openapi";
import { PUBLIC_API_PATHS } from "../app/lib/public-api";
import { createWithScriptBodySchema } from "../app/lib/schemas/api/create-with-script";
import { chatSmsBodySchema } from "../app/lib/schemas/api/chat-sms";
import { campaignSmsDispatchBodySchema } from "../app/lib/schemas/api/sms";

const scriptCampaignTypes = [
  "live_call",
  "robocall",
  "simple_ivr",
  "complex_ivr",
] as const;

describe("openapi spec", () => {
  test("has basic OpenAPI structure", () => {
    expect(openApiSpec.openapi).toBe("3.0.3");
    expect(openApiSpec.info.title).toBe("CallCaster API");
  });

  test("documents all public API paths", () => {
    for (const path of PUBLIC_API_PATHS) {
      expect(openApiSpec.paths).toHaveProperty(path);
    }
    expect(Object.keys(openApiSpec.paths)).toHaveLength(PUBLIC_API_PATHS.length);
  });

  test("each public operation has required metadata", () => {
    for (const path of PUBLIC_API_PATHS) {
      const pathItem = openApiSpec.paths[path as keyof typeof openApiSpec.paths];
      const operation = pathItem.post;
      expect(operation).toBeDefined();
      expect(operation?.operationId).toBeTruthy();
      expect(operation?.tags).toContain("Public");
      expect(operation?.security).toEqual([
        { sessionCookie: [] },
        { apiKey: [] },
      ]);
      expect(operation?.requestBody?.required).toBe(true);
      expect(operation?.responses?.["400"]).toBeDefined();
      expect(operation?.responses?.["401"]).toBeDefined();
      expect(operation?.responses?.["403"]).toBeDefined();
    }
  });

  test("create-with-script request enum matches Zod schema", () => {
    const schema =
      openApiSpec.components.schemas.CreateCampaignWithScriptRequest;
    const openApiEnum = schema.properties.type.enum;
    expect(openApiEnum).toEqual([...scriptCampaignTypes]);
    expect(createWithScriptBodySchema.safeParse({
      title: "t",
      type: "live_call",
      caller_id: "+1",
      script_id: 1,
    }).success).toBe(true);
  });

  test("chat_sms required fields match Zod schema", () => {
    const required = openApiSpec.components.schemas.ChatSmsRequest.required;
    expect(required).toEqual(
      expect.arrayContaining(["workspace_id", "to_number", "caller_id", "body"]),
    );
    expect(
      chatSmsBodySchema.safeParse({
        workspace_id: "550e8400-e29b-41d4-a716-446655440000",
        to_number: "+15551234567",
        caller_id: "+15559876543",
        body: "hi",
      }).success,
    ).toBe(true);
  });

  test("campaign sms dispatch required fields match Zod schema", () => {
    const required =
      openApiSpec.components.schemas.CampaignSmsDispatchRequest.required;
    expect(required).toEqual(
      expect.arrayContaining(["workspace_id", "campaign_id"]),
    );
    expect(
      campaignSmsDispatchBodySchema.safeParse({
        workspace_id: "550e8400-e29b-41d4-a716-446655440000",
        campaign_id: "123",
      }).success,
    ).toBe(true);
  });
});
