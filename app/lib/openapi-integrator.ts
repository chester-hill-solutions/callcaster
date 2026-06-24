/**
 * Detailed OpenAPI definitions for API-key integrator endpoints (Hey API codegen).
 */
import { INTEGRATOR_API_TAG } from "@/lib/public-api";

const errorResponse = (description: string) => ({
  description,
  content: {
    "application/json": {
      schema: { $ref: "#/components/schemas/Error" },
    },
  },
});

const publicSecurity = [{ sessionCookie: [] }, { apiKey: [] }] as const;

const securitySchemes = {
  sessionCookie: {
    type: "apiKey" as const,
    in: "cookie" as const,
    name: "sb-access-token",
    description:
      "Session cookie (browser). Use workspace API key for server/script access.",
  },
  apiKey: {
    type: "apiKey" as const,
    in: "header" as const,
    name: "X-API-Key",
    description:
      "Workspace API key (prefix cc_). Alternatively: Authorization: Bearer <key>.",
  },
};

const schemas = {
  Error: {
    type: "object" as const,
    required: ["error"] as const,
    properties: {
      error: { type: "string" as const },
    },
  },
  WorkspaceId: {
    type: "string" as const,
    format: "uuid" as const,
    description:
      "Required in the request body when using session auth. Optional with API key; must match the key workspace if provided.",
  },
  CreateCampaignWithScriptRequest: {
    type: "object" as const,
    description:
      "Provide exactly one of `script` or `script_id` (XOR). Enforced in Zod validation, not in OpenAPI required fields.",
    required: ["title", "type", "caller_id"] as const,
    properties: {
      workspace_id: { $ref: "#/components/schemas/WorkspaceId" },
      title: { type: "string" as const, description: "Campaign title." },
      type: {
        type: "string" as const,
        enum: ["live_call", "robocall", "simple_ivr", "complex_ivr"] as const,
        description: "Campaign type (script-based).",
      },
      caller_id: {
        type: "string" as const,
        description:
          "Outbound caller ID. Must be a workspace phone number (e.g. +15551234567).",
      },
      script: {
        type: "object" as const,
        description: "Inline script to create and attach. Use this OR script_id.",
        required: ["name"] as const,
        properties: {
          name: { type: "string" as const, description: "Script display name." },
          type: {
            type: "string" as const,
            enum: ["script", "ivr"] as const,
            description:
              "script for live_call, ivr for IVR types. Defaults from campaign type.",
          },
          steps: {
            type: "object" as const,
            description:
              "Script content (pages, blocks). See docs/script-json-format.md.",
            additionalProperties: true,
          },
        },
      },
      script_id: {
        type: "integer" as const,
        description: "ID of an existing script to attach. Use this OR script.",
      },
      audience_ids: {
        type: "array" as const,
        items: { type: "integer" as const },
        description: "Audience IDs to attach (must belong to workspace).",
      },
      enqueue_audience_contacts: {
        type: "boolean" as const,
        default: true,
        description:
          "If true, enqueue contacts from attached audiences; if false, only link audiences.",
      },
      status: {
        type: "string" as const,
        default: "draft",
        description: "Campaign status (e.g. draft, active).",
      },
      is_active: { type: "boolean" as const },
      start_date: { type: "string" as const, nullable: true, format: "date-time" },
      end_date: { type: "string" as const, nullable: true, format: "date-time" },
      schedule: { type: "object" as const, additionalProperties: true },
    },
  },
  CreateCampaignWithScriptResponse: {
    type: "object" as const,
    properties: {
      campaign: {
        type: "object" as const,
        description:
          "Created campaign row (id, title, workspace, type, caller_id, status, ...).",
        additionalProperties: true,
      },
      campaignDetails: {
        type: "object" as const,
        description:
          "Type-specific details (e.g. live_campaign/ivr_campaign) with campaign_id, script_id.",
        additionalProperties: true,
      },
      script: {
        type: "object" as const,
        description: "Present only when a script was created in this request.",
        properties: {
          id: { type: "integer" as const },
          name: { type: "string" as const },
          type: { type: "string" as const, nullable: true },
          steps: { type: "object" as const, additionalProperties: true },
        },
      },
      audiences_linked: {
        type: "integer" as const,
        description: "Number of campaign–audience links created.",
      },
      contacts_enqueued: {
        type: "integer" as const,
        description: "Total contacts added to the campaign queue.",
      },
    },
  },
  ChatSmsRequest: {
    type: "object" as const,
    description: "Session auth requires workspace_id in the body.",
    required: ["workspace_id", "to_number", "caller_id", "body"] as const,
    properties: {
      workspace_id: { $ref: "#/components/schemas/WorkspaceId" },
      to_number: {
        type: "string" as const,
        description: "Recipient phone number (E.164 recommended).",
      },
      caller_id: {
        type: "string" as const,
        description: "Workspace outbound caller ID.",
      },
      body: { type: "string" as const, description: "SMS message body." },
      contact_id: {
        type: "string" as const,
        description: "Optional contact ID for template tag substitution.",
      },
      media: {
        type: "string" as const,
        description: "Optional media URL or path for MMS.",
      },
      message_intent: {
        type: "string" as const,
        description: "Twilio message intent (e.g. marketing, utility).",
      },
      messaging_service_sid: {
        type: "string" as const,
        description: "Optional Twilio Messaging Service SID override.",
      },
    },
  },
  ChatSmsResponse: {
    type: "object" as const,
    properties: {
      data: { type: "object" as const, additionalProperties: true },
      message: { type: "object" as const, additionalProperties: true },
    },
  },
  CampaignSmsDispatchRequest: {
    type: "object" as const,
    description:
      "Session auth requires workspace_id. API key auth requires user_id for outreach attribution.",
    required: ["workspace_id", "campaign_id"] as const,
    properties: {
      workspace_id: { $ref: "#/components/schemas/WorkspaceId" },
      campaign_id: {
        type: "string" as const,
        description: "Message campaign ID whose queued contacts receive SMS.",
      },
      caller_id: {
        type: "string" as const,
        description:
          "Outbound caller ID. Required when campaign sms_send_mode requires it.",
      },
      user_id: {
        type: "string" as const,
        description:
          "Required when using API key auth (outreach attribution). Session auth uses the logged-in user.",
      },
      message_intent: {
        type: "string" as const,
        description: "Twilio message intent override.",
      },
      messaging_service_sid: {
        type: "string" as const,
        description: "Twilio Messaging Service SID override.",
      },
    },
  },
  CampaignSmsDispatchResponse: {
    type: "object" as const,
    properties: {
      responses: {
        type: "array" as const,
        items: { type: "object" as const, additionalProperties: true },
        description:
          "Per-contact send results keyed by contact_id (success, skipped, or error).",
      },
    },
  },
};

export const integratorOpenApiComponents = {
  securitySchemes,
  schemas,
} as const;

export const integratorPathOverrides = {
  "/api/campaigns/create-with-script": {
    post: {
      operationId: "createCampaignWithScript",
      summary: "Create campaign with script and phone number (one-shot)",
      description:
        "Creates a call campaign in a single request: optionally creates a script, creates the campaign with a caller ID, and attaches audiences (with optional contact enqueue). Provide exactly one of `script` or `script_id`, not both.",
      tags: [INTEGRATOR_API_TAG, "Campaigns"],
      security: [...publicSecurity],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/CreateCampaignWithScriptRequest",
            },
            examples: {
              inlineScript: {
                summary: "Inline script with audiences",
                value: {
                  workspace_id: "550e8400-e29b-41d4-a716-446655440000",
                  title: "Q1 outbound campaign",
                  type: "live_call",
                  caller_id: "+15551234567",
                  script: {
                    name: "Main script",
                    type: "script",
                    steps: { pages: {}, blocks: {} },
                  },
                  audience_ids: [1, 2],
                  status: "draft",
                  enqueue_audience_contacts: true,
                },
              },
            },
          },
        },
      },
      responses: {
        "201": {
          description: "Campaign created",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/CreateCampaignWithScriptResponse",
              },
            },
          },
        },
        "400": errorResponse("Validation or creation error"),
        "401": errorResponse("Unauthorized (missing or invalid session / API key)"),
        "403": errorResponse("Forbidden (e.g. workspace_id does not match API key)"),
        "405": errorResponse("Method not allowed"),
        "500": errorResponse("Server error"),
      },
    },
  },
  "/api/chat_sms": {
    post: {
      operationId: "sendChatSms",
      summary: "Send a single SMS",
      description:
        "Sends one outbound SMS to a phone number. When `contact_id` is provided, template tags in `body` are substituted from the contact record. Session auth requires `workspace_id` in the body.",
      tags: [INTEGRATOR_API_TAG, "Messaging"],
      security: [...publicSecurity],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ChatSmsRequest" },
          },
        },
      },
      responses: {
        "201": {
          description: "Message sent",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ChatSmsResponse" },
            },
          },
        },
        "400": errorResponse("Validation error"),
        "401": errorResponse("Unauthorized"),
        "403": errorResponse("Forbidden (workspace mismatch)"),
        "404": errorResponse("Invalid phone number"),
        "500": errorResponse("Send failure"),
      },
    },
  },
  "/api/sms": {
    post: {
      operationId: "dispatchCampaignSms",
      summary: "Dispatch SMS to queued campaign contacts",
      description:
        "Legacy batch dispatch: sends SMS to all queued contacts on a message campaign. Processes template tags per contact. Duplicate sends to the same number are skipped and the queue row is dequeued. API key auth requires `user_id` for outreach attribution; session auth uses the logged-in user.",
      tags: [INTEGRATOR_API_TAG, "Messaging"],
      security: [...publicSecurity],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/CampaignSmsDispatchRequest",
            },
          },
        },
      },
      responses: {
        "200": {
          description: "Batch dispatch completed",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/CampaignSmsDispatchResponse",
              },
            },
          },
        },
        "400": errorResponse("Validation or campaign error"),
        "401": errorResponse("Unauthorized"),
        "403": errorResponse("Forbidden (workspace mismatch)"),
        "500": errorResponse("Dispatch failure"),
      },
    },
  },
} as const;

/** SDK/codegen spec — integrator JSON endpoints only. */
export const integratorOpenApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "CallCaster Integrator API",
    description:
      "API-key and session JSON endpoints for external automation: campaign setup and SMS dispatch.",
    version: "1.0.0",
  },
  servers: [{ url: "/", description: "Current origin" }],
  tags: [
    {
      name: INTEGRATOR_API_TAG,
      description: "Automation-friendly JSON APIs (API key or session).",
    },
    { name: "Campaigns", description: "Campaign creation and setup." },
    { name: "Messaging", description: "SMS send and campaign dispatch." },
  ],
  paths: integratorPathOverrides,
  components: integratorOpenApiComponents,
} as const;
