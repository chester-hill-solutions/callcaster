/**
 * OpenAPI 3.0 spec for CallCaster API (campaigns and related endpoints).
 * Served at /api/docs/openapi for the interactive docs UI.
 */
export const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "CallCaster API",
    description:
      "API for creating and managing call campaigns, including one-shot campaign creation with script, caller ID, and audiences.",
    version: "1.0.0",
  },
  servers: [
    { url: "/", description: "Current origin" },
  ],
  paths: {
    "/api/campaigns/create-with-script": {
      post: {
        operationId: "createCampaignWithScript",
        summary: "Create campaign with script and phone number (one-shot)",
        description:
          "Creates a call campaign in a single request: optionally creates a script, creates the campaign with a caller ID, and attaches audiences (with optional contact enqueue). Supports session or workspace API key authentication.",
        tags: ["Campaigns"],
        security: [
          { sessionCookie: [] },
          { apiKey: [] },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateCampaignWithScriptRequest" },
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
                      steps: {
                        pages: {
                          page_1: {
                            id: "page_1",
                            title: "Intro",
                            blocks: ["block_1"],
                          },
                        },
                        blocks: {
                          block_1: {
                            id: "block_1",
                            type: "textarea",
                            title: "Opening",
                            content: "Hello, this is [Company].",
                            options: [],
                            audioFile: "",
                          },
                        },
                      },
                    },
                    audience_ids: [1, 2],
                    status: "draft",
                    enqueue_audience_contacts: true,
                  },
                },
                existingScript: {
                  summary: "Existing script (e.g. with API key)",
                  value: {
                    title: "Follow-up campaign",
                    type: "robocall",
                    caller_id: "+15559876543",
                    script_id: 42,
                    audience_ids: [3],
                    status: "draft",
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
                schema: { $ref: "#/components/schemas/CreateCampaignWithScriptResponse" },
              },
            },
          },
          "400": {
            description: "Validation or creation error",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },
          "401": {
            description: "Unauthorized (missing or invalid session / API key)",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },
          "403": {
            description: "Forbidden (e.g. workspace_id does not match API key)",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },
          "405": {
            description: "Method not allowed",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      sessionCookie: {
        type: "apiKey",
        in: "cookie",
        name: "sb-access-token",
        description: "Session cookie (browser). Use workspace API key for server/script access.",
      },
      apiKey: {
        type: "apiKey",
        in: "header",
        name: "X-API-Key",
        description:
          "Workspace API key (prefix cc_). Alternatively: Authorization: Bearer <key>.",
      },
    },
    schemas: {
      CreateCampaignWithScriptRequest: {
        type: "object",
        required: ["title", "type", "caller_id"],
        properties: {
          workspace_id: {
            type: "string",
            format: "uuid",
            description:
              "Required when using session auth. Optional with API key; must match key's workspace if provided.",
          },
          title: { type: "string", description: "Campaign title." },
          type: {
            type: "string",
            enum: ["live_call", "robocall", "simple_ivr", "complex_ivr"],
            description: "Campaign type (script-based).",
          },
          caller_id: {
            type: "string",
            description:
              "Outbound caller ID. Must be a workspace phone number (e.g. +15551234567).",
          },
          script: {
            type: "object",
            description: "Inline script to create and attach. Use this OR script_id.",
            properties: {
              name: { type: "string", description: "Script display name." },
              type: {
                type: "string",
                enum: ["script", "ivr"],
                description: "script for live_call, ivr for IVR types. Defaults from campaign type.",
              },
              steps: {
                type: "object",
                description:
                  "Script content (pages, blocks). See docs/script-json-format.md.",
                additionalProperties: true,
              },
            },
          },
          script_id: {
            type: "integer",
            description: "ID of an existing script to attach. Use this OR script.",
          },
          audience_ids: {
            type: "array",
            items: { type: "integer" },
            description: "Audience IDs to attach (must belong to workspace).",
          },
          enqueue_audience_contacts: {
            type: "boolean",
            default: true,
            description:
              "If true, enqueue contacts from attached audiences; if false, only link audiences.",
          },
          status: {
            type: "string",
            default: "draft",
            description: "Campaign status (e.g. draft, active).",
          },
          is_active: { type: "boolean" },
          start_date: { type: "string", nullable: true, format: "date-time" },
          end_date: { type: "string", nullable: true, format: "date-time" },
          schedule: { type: "object", additionalProperties: true },
        },
      },
      CreateCampaignWithScriptResponse: {
        type: "object",
        properties: {
          campaign: {
            type: "object",
            description: "Created campaign row (id, title, workspace, type, caller_id, status, ...).",
            additionalProperties: true,
          },
          campaignDetails: {
            type: "object",
            description: "Type-specific details (e.g. live_campaign/ivr_campaign) with campaign_id, script_id.",
            additionalProperties: true,
          },
          script: {
            type: "object",
            description: "Present only when a script was created in this request.",
            properties: {
              id: { type: "integer" },
              name: { type: "string" },
              type: { type: "string", nullable: true },
              steps: { type: "object" },
            },
          },
          audiences_linked: {
            type: "integer",
            description: "Number of campaign–audience links created.",
          },
          contacts_enqueued: {
            type: "integer",
            description: "Total contacts added to the campaign queue.",
          },
        },
      },
      Error: {
        type: "object",
        properties: {
          error: { type: "string" },
        },
      },
    },
  },
} as const;
