import { describe, expect, test } from "vitest";

import { getPublicOpenApiEntries } from "../app/lib/api-surface";
import { openApiSpec } from "../app/lib/openapi";
import { completeOpenApiSpec } from "../app/lib/openapi-complete";
import { API_SURFACE_CORE } from "../app/lib/api-surface-generated";
import { toOpenApiPath } from "../app/lib/openapi-build";
import {
  INTEGRATOR_API_PATHS,
} from "../app/lib/public-api";
import { createWithScriptBodySchema } from "../app/lib/schemas/api/create-with-script";
import { chatSmsBodySchema } from "../app/lib/schemas/api/chat-sms";
import { campaignSmsDispatchBodySchema } from "../app/lib/schemas/api/sms";
import { tokenBodySchema } from "../app/lib/schemas/api/platform-auth";
import { zConversationSummaryMode, zWorkspaceUnreadCountResponse } from "../app/lib/api-generated/zod.gen";

const scriptCampaignTypes = ["live_call", "robocall"] as const;

describe("openapi spec", () => {
  test.each([
    { route: "/api/workspaces/:workspaceId/billing/checkout-session", path: "/api/workspaces/{workspaceId}/billing/checkout-session", method: "post" },
    { route: "/api/workspaces/:workspaceId/billing/sessions/:sessionId", path: "/api/workspaces/{workspaceId}/billing/sessions/{sessionId}", method: "get" },
  ])("derives and documents Admin session access for $route", ({ route, path, method }) => {
    expect(API_SURFACE_CORE.find((entry) => entry.path === route)?.authClass).toBe("workspaceAdmin");
    for (const spec of [openApiSpec, completeOpenApiSpec]) {
      const operation = spec.paths[path]?.[method];
      expect(operation?.["x-callcaster-auth-class"]).toBe("workspaceAdmin");
      expect(operation?.["x-callcaster-exposure"]).toBe("sessionOnly");
      expect(operation?.security).toEqual([{ sessionCookie: [] }, { secureSessionCookie: [] }]);
      expect(operation?.description).toContain("Admin or Owner user session");
      expect(operation?.description).toContain("Member and Caller receive 403");
      expect(operation?.description).toContain("non-members receive 404");
      expect(operation?.responses?.["401"]).toBeDefined();
      expect(operation?.responses?.["403"]).toBeDefined();
    }
  });
  test("documents the optional workspace unread mode and validates its count contract", () => {
    const operation = openApiSpec.paths["/api/workspaces/{workspaceId}/conversations"].get;
    expect(operation?.operationId).toBe("getWorkspaces_workspaceId_conversations");
    expect(operation?.["x-callcaster-capability"]).toBe("campaigns.read");
    expect(operation?.["x-callcaster-exposure"]).toBe("sessionOnly");
    expect(operation?.parameters).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "summary", in: "query", required: false,
        schema: { $ref: "#/components/schemas/ConversationSummaryMode" } }),
    ]));
    expect(operation?.responses?.["200"]?.content?.["application/json"]?.schema?.oneOf).toEqual(
      expect.arrayContaining([{ $ref: "#/components/schemas/WorkspaceUnreadCountResponse" }]),
    );
    expect(zConversationSummaryMode.safeParse("unread").success).toBe(true);
    expect(zConversationSummaryMode.safeParse("other").success).toBe(false);
    expect(zWorkspaceUnreadCountResponse.safeParse({ unread_count: 107 }).success).toBe(true);
    expect(zWorkspaceUnreadCountResponse.safeParse({ unread_count: 0 }).success).toBe(true);
    for (const unread_count of [-1, 1.5, "107", Number.MAX_SAFE_INTEGER + 1]) {
      expect(zWorkspaceUnreadCountResponse.safeParse({ unread_count }).success).toBe(false);
    }
    expect(zWorkspaceUnreadCountResponse.safeParse({}).success).toBe(false);
  });
  test("has basic OpenAPI structure", () => {
    expect(openApiSpec.openapi).toBe("3.0.3");
    expect(openApiSpec.info.title).toBe("CallCaster API");
  });

  test("includes user-facing workspace and campaign routes", () => {
    expect(openApiSpec.paths).toHaveProperty("/api/campaigns");
    expect(openApiSpec.paths).toHaveProperty("/api/workspaces/{workspaceId}");
    expect(openApiSpec.paths).toHaveProperty("/api/contacts");
    expect(Object.keys(openApiSpec.paths).length).toBeGreaterThan(40);
  });

  test("excludes webhooks and internal-only routes", () => {
    expect(openApiSpec.paths).not.toHaveProperty("/api/inbound");
    expect(openApiSpec.paths).not.toHaveProperty("/api/stripe-webhook");
    expect(openApiSpec.paths).not.toHaveProperty("/api/auto-dial/dialer");
  });

  test("matches publicOpenApi inventory entries", () => {
    for (const entry of getPublicOpenApiEntries()) {
      if (entry.duplicate && entry.routeModule.endsWith(".js")) continue;
      expect(openApiSpec.paths).toHaveProperty(toOpenApiPath(entry.path));
    }
  });

  test("path keys use OpenAPI 3.0 {param} templating, not Express :param", () => {
    for (const pathKey of Object.keys(openApiSpec.paths)) {
      expect(pathKey, pathKey).not.toMatch(/:[A-Za-z0-9_]+/);
    }
    expect(openApiSpec.paths).toHaveProperty(
      "/api/workspaces/{workspaceId}/analytics",
    );
  });

  test("documents all integrator API paths with detailed schemas", () => {
    for (const path of INTEGRATOR_API_PATHS) {
      expect(openApiSpec.paths).toHaveProperty(path);
    }
  });

  test("each integrator operation has required metadata", () => {
    for (const path of INTEGRATOR_API_PATHS) {
      const pathItem = openApiSpec.paths[path as keyof typeof openApiSpec.paths];
      const operation = pathItem.post;
      expect(operation).toBeDefined();
      expect(operation?.operationId).toBeTruthy();
      // Pinned literal: the integrator spec section name is the contract.
      expect(operation?.tags).toContain("Integrator API");
      expect(operation?.security).toEqual([
        { sessionCookie: [] }, { secureSessionCookie: [] },
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
    expect(createWithScriptBodySchema.safeParse({
      title: "t",
      type: "live_call",
      caller_id: "+1",
      script: { name: "s", steps: {} },
      script_id: 1,
    }).success).toBe(false);

    for (const legacyType of ["simple_ivr", "complex_ivr"] as const) {
      const result = createWithScriptBodySchema.safeParse({
        title: "t",
        type: legacyType,
        caller_id: "+1",
        script_id: 1,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              path: ["type"],
              message: `"${legacyType}" is no longer supported; use "robocall" instead`,
            }),
          ]),
        );
      }
    }
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

  test("auth token request fields match Zod schema", () => {
    const required = openApiSpec.components.schemas.TokenRequest.required;
    expect(required).toEqual(expect.arrayContaining(["email", "password"]));
    expect(
      tokenBodySchema.safeParse({
        email: "user@example.com",
        password: "secret",
      }).success,
    ).toBe(true);
    expect(openApiSpec.paths).toHaveProperty("/api/auth/token");
  });

  test("create-with-script operation description documents XOR rule", () => {
    const op =
      openApiSpec.paths["/api/campaigns/create-with-script"].post;
    expect(op?.description).toMatch(/exactly one/i);
    expect(
      openApiSpec.components.schemas.CreateCampaignWithScriptRequest.description,
    ).toMatch(/Zod/i);
  });

  test("each integrator operation has success response with content schema", () => {
    const successByPath: Record<(typeof INTEGRATOR_API_PATHS)[number], string> = {
      "/api/campaigns/create-with-script": "201",
      "/api/chat_sms": "201",
      "/api/sms": "200",
    };
    for (const path of INTEGRATOR_API_PATHS) {
      const op = openApiSpec.paths[path].post;
      const code = successByPath[path];
      const schema =
        op?.responses?.[code]?.content?.["application/json"]?.schema;
      expect(schema).toBeDefined();
    }
  });

  test("dispatchCampaignSms description mentions queue/batch caveat", () => {
    const op = openApiSpec.paths["/api/sms"].post;
    expect(op?.description).toMatch(/queue|batch|dequeue/i);
  });

  test("cutover telephony routes have stable operationIds and dual auth", () => {
    const dialer =
      openApiSpec.paths["/api/workspaces/{workspaceId}/campaigns/{campaignId}/dialer/start"]
        .post;
    const disconnect =
      openApiSpec.paths["/api/workspaces/{workspaceId}/calls/{callSid}/disconnect"].post;

    expect(dialer?.operationId).toBe("startCampaignDialer");
    expect(disconnect?.operationId).toBe("disconnectWorkspaceCall");
    expect(dialer?.security).toEqual([{ sessionCookie: [] }, { secureSessionCookie: [] }, { apiKey: [] }]);
    expect(disconnect?.security).toEqual([{ sessionCookie: [] }, { secureSessionCookie: [] }, { apiKey: [] }]);
    expect(dialer?.["x-callcaster-capability"]).toBe("calls.start");
    expect(disconnect?.["x-callcaster-capability"]).toBe("calls.control");
    expect(dialer?.requestBody?.required).toBe(true);
    expect(
      dialer?.responses?.["200"]?.content?.["application/json"]?.schema?.$ref,
    ).toContain("DialerStartResponse");
  });

  test("audit events route documents dual auth with audit.read capability", () => {
    const audit =
      openApiSpec.paths["/api/workspaces/{workspaceId}/audit-events"].get;

    expect(audit?.operationId).toBe("listWorkspaceAuditEvents");
    expect(audit?.security).toEqual([{ sessionCookie: [] }, { secureSessionCookie: [] }, { apiKey: [] }]);
    expect(audit?.["x-callcaster-capability"]).toBe("audit.read");
    expect(
      audit?.responses?.["200"]?.content?.["application/json"]?.schema?.$ref,
    ).toContain("WorkspaceAuditEventListResponse");
  });

  test("CreateApiKeyRequest requires scopes and documents expiry", () => {
    const schema = openApiSpec.components.schemas.CreateApiKeyRequest;
    expect(schema.required).toEqual(expect.arrayContaining(["name", "scopes"]));
    expect(schema.properties.scopes.minItems).toBe(1);
    expect(schema.properties.expires_in_days.maximum).toBe(365);
    expect(
      openApiSpec.components.schemas.ProductCapabilityId.enum,
    ).toContain("campaigns.read");
  });

  test("integrator operations declare required capabilities", () => {
    expect(
      openApiSpec.paths["/api/campaigns/create-with-script"].post?.[
        "x-callcaster-capability"
      ],
    ).toBe("campaigns.write");
    expect(
      openApiSpec.paths["/api/chat_sms"].post?.["x-callcaster-capability"],
    ).toBe("messages.send");
    expect(openApiSpec.paths["/api/sms"].post?.["x-callcaster-capability"]).toBe(
      "campaigns.dispatch",
    );
  });

  test("workspace scoped routes have stable operationIds and mixed auth", () => {
    const workspace = openApiSpec.paths["/api/workspaces/{workspaceId}"];

    expect(workspace.get?.operationId).toBe("getWorkspace");
    expect(workspace.patch?.operationId).toBe("updateWorkspace");
    expect(workspace.delete?.operationId).toBe("deleteWorkspace");
    expect(workspace.get?.security).toEqual([{ sessionCookie: [] }, { secureSessionCookie: [] }, { apiKey: [] }]);
    expect(workspace.patch?.security).toEqual([{ sessionCookie: [] }, { secureSessionCookie: [] }]);
    expect(workspace.delete?.security).toEqual([{ sessionCookie: [] }, { secureSessionCookie: [] }]);
    expect(
      workspace.patch?.requestBody?.content?.["application/json"]?.schema?.$ref,
    ).toContain("UpdateWorkspaceRequest");
    expect(
      workspace.get?.responses?.["200"]?.content?.["application/json"]?.schema?.$ref,
    ).toContain("WorkspaceDetailResponse");
  });

  test("workspace admin routes have stable operationIds and session auth", () => {
    const apiKeys = openApiSpec.paths["/api/workspaces/{workspaceId}/api-keys"];
    const members = openApiSpec.paths["/api/workspaces/{workspaceId}/members"];
    const webhook = openApiSpec.paths["/api/workspaces/{workspaceId}/webhook"];
    const numbers = openApiSpec.paths["/api/workspaces/{workspaceId}/numbers"];
    const transfer =
      openApiSpec.paths["/api/workspaces/{workspaceId}/transfer-ownership"].post;

    expect(apiKeys.get?.operationId).toBe("listWorkspaceApiKeys");
    expect(apiKeys.post?.operationId).toBe("createWorkspaceApiKey");
    expect(apiKeys.delete?.operationId).toBe("deleteWorkspaceApiKey");
    expect(members.post?.operationId).toBe("inviteWorkspaceMember");
    expect(members.post?.["x-callcaster-capability"]).toBe("members.invite");
    expect(webhook.put?.operationId).toBe("upsertWorkspaceWebhook");
    expect(webhook.post?.operationId).toBe("testWorkspaceWebhook");
    expect(webhook.post?.responses).toHaveProperty("404");
    expect(webhook.post?.responses).toHaveProperty("429");
    expect(webhook.post?.description).toContain("Ten tests per minute per user");
    expect(transfer?.operationId).toBe("transferWorkspaceOwnership");
    expect(numbers.get?.operationId).toBe("listWorkspaceNumbers");
    expect(numbers.post?.operationId).toBe("purchaseWorkspaceNumber");
    expect(
      openApiSpec.paths["/api/workspaces/{workspaceId}/numbers/{numberId}"].patch
        ?.operationId,
    ).toBe("patchWorkspaceNumber");

    for (const pathItem of [apiKeys, webhook, numbers]) {
      for (const op of Object.values(pathItem)) {
        if (op && typeof op === "object" && "security" in op) {
          expect(op.security).toEqual([{ sessionCookie: [] }, { secureSessionCookie: [] }]);
        }
      }
    }
    expect(members.get?.security).toEqual([{ sessionCookie: [] }, { secureSessionCookie: [] }]);
    expect(members.post?.security).toEqual([
      { sessionCookie: [] }, { secureSessionCookie: [] },
      { apiKey: [] },
    ]);
    expect(members.patch?.security).toEqual([{ sessionCookie: [] }, { secureSessionCookie: [] }]);
    expect(members.delete?.security).toEqual([{ sessionCookie: [] }, { secureSessionCookie: [] }]);
    expect(transfer?.security).toEqual([{ sessionCookie: [] }, { secureSessionCookie: [] }]);
  });
});

describe("media upload byte-limit contract", () => {
  test.each([
    { path: "/api/media", method: "post" },
    { path: "/api/message_media", method: "post" },
    { path: "/api/message_media", method: "delete" },
  ])("$method $path documents its encoded limit and rejection", ({path, method}) => {
    const operation = openApiSpec.paths[path]?.[method];
    expect(operation).toMatchObject({
      "x-callcaster-request-body-limit": 10551296,
      responses: {
        "400": { description: expect.stringContaining("Malformed form body") },
        "413": { description: expect.stringContaining("10551296 bytes") },
      },
    });
    expect(operation?.description).toContain("10 MiB");
  });
  test("unrelated multipart routes do not claim the media bound", () => {
    const operation = openApiSpec.paths["/api/audience-upload"]?.post;
    expect(operation).toBeDefined();
    expect(operation).not.toHaveProperty("x-callcaster-request-body-limit");
    expect(operation?.responses).not.toHaveProperty("413");
  });
});
