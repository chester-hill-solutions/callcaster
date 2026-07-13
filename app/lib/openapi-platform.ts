/**
 * Detailed OpenAPI definitions for Platform / agent-friendly CaaS routes.
 */
const errorResponse = (description: string) => ({
  description,
  content: {
    "application/json": {
      schema: { $ref: "#/components/schemas/PlatformError" },
    },
  },
});

const rateLimitResponse = {
  description: "Rate limit exceeded",
  content: {
    "application/json": {
      schema: { $ref: "#/components/schemas/PlatformError" },
    },
  },
  headers: {
    "Retry-After": {
      schema: { type: "integer" as const },
      description: "Seconds until the client may retry.",
    },
  },
};

export const platformOpenApiComponents = {
  schemas: {
    PlatformError: {
      type: "object" as const,
      required: ["error"] as const,
      properties: {
        error: { type: "string" as const },
        code: { type: "string" as const },
      },
    },
    RegisterRequest: {
      type: "object" as const,
      required: ["email", "password"] as const,
      properties: {
        email: { type: "string" as const, format: "email" },
        password: { type: "string" as const, minLength: 8 },
        first_name: { type: "string" as const },
        last_name: { type: "string" as const },
      },
    },
    AuthTokensResponse: {
      type: "object" as const,
      required: ["access_token", "refresh_token", "token_type", "user"] as const,
      properties: {
        access_token: { type: "string" as const },
        refresh_token: { type: "string" as const },
        expires_in: { type: "integer" as const },
        token_type: { type: "string" as const, enum: ["bearer"] as const },
        user: {
          type: "object" as const,
          properties: {
            id: { type: "string" as const, format: "uuid" },
            email: { type: "string" as const, format: "email" },
            first_name: { type: "string" as const, nullable: true },
            last_name: { type: "string" as const, nullable: true },
          },
        },
      },
    },
    TokenRequest: {
      type: "object" as const,
      required: ["email", "password"] as const,
      properties: {
        email: { type: "string" as const, format: "email" },
        password: { type: "string" as const },
      },
    },
    RefreshRequest: {
      type: "object" as const,
      required: ["refresh_token"] as const,
      properties: {
        refresh_token: { type: "string" as const },
      },
    },
    ForgotPasswordRequest: {
      type: "object" as const,
      required: ["email"] as const,
      properties: {
        email: { type: "string" as const, format: "email" },
      },
    },
    CreateWorkspaceRequest: {
      type: "object" as const,
      required: ["name"] as const,
      properties: {
        name: { type: "string" as const, minLength: 1, maxLength: 200 },
      },
    },
    CreateWorkspaceResponse: {
      type: "object" as const,
      required: ["id", "name"] as const,
      properties: {
        id: { type: "string" as const, format: "uuid" },
        name: { type: "string" as const },
        provisioning_warning: { type: "string" as const, nullable: true },
      },
    },
    DialerStartRequest: {
      type: "object" as const,
      required: ["caller_id", "selected_device"] as const,
      properties: {
        caller_id: {
          type: "string" as const,
          description: "E.164 caller ID to present on outbound dials.",
        },
        selected_device: {
          type: "string" as const,
          description: "Twilio client device identifier for the agent leg.",
        },
        agentUserId: {
          type: "string" as const,
          format: "uuid",
          description: "Required when authenticating with a workspace API key.",
        },
      },
    },
    DialerStartResponse: {
      type: "object" as const,
      required: ["success", "conferenceName"] as const,
      properties: {
        success: { type: "boolean" as const, enum: [true] as const },
        conferenceName: { type: "string" as const },
      },
    },
    CallDisconnectResponse: {
      type: "object" as const,
      required: ["success"] as const,
      properties: {
        success: { type: "boolean" as const, enum: [true] as const },
      },
    },
    WorkspaceAuditEvent: {
      type: "object" as const,
      required: [
        "id",
        "workspace_id",
        "created_at",
        "actor_type",
        "action",
        "outcome",
      ] as const,
      properties: {
        id: { type: "integer" as const },
        workspace_id: { type: "string" as const, format: "uuid" },
        created_at: { type: "string" as const, format: "date-time" },
        actor_type: {
          type: "string" as const,
          enum: ["session", "api_key", "system", "support"] as const,
        },
        actor_id: { type: "string" as const, nullable: true },
        api_key_id: { type: "integer" as const, nullable: true },
        action: { type: "string" as const },
        target_type: { type: "string" as const, nullable: true },
        target_id: { type: "string" as const, nullable: true },
        outcome: {
          type: "string" as const,
          enum: ["success", "failure", "denied"] as const,
        },
        request_id: { type: "string" as const, nullable: true },
        metadata: {
          type: "object" as const,
          additionalProperties: true,
        },
      },
    },
    WorkspaceAuditEventListResponse: {
      type: "object" as const,
      required: ["events"] as const,
      properties: {
        events: {
          type: "array" as const,
          items: { $ref: "#/components/schemas/WorkspaceAuditEvent" },
        },
        next_cursor: { type: "string" as const, nullable: true },
      },
    },
    WorkspaceSummary: {
      type: "object" as const,
      required: ["name"] as const,
      properties: {
        name: { type: "string" as const },
      },
    },
    WorkspaceDetail: {
      type: "object" as const,
      required: ["id", "name"] as const,
      properties: {
        id: { type: "string" as const, format: "uuid" },
        name: { type: "string" as const },
        credits: { type: "number" as const, nullable: true },
        created_at: { type: "string" as const, format: "date-time", nullable: true },
      },
    },
    WorkspaceDetailResponse: {
      type: "object" as const,
      required: ["workspace"] as const,
      properties: {
        workspace: { $ref: "#/components/schemas/WorkspaceSummary" },
      },
    },
    UpdateWorkspaceRequest: {
      type: "object" as const,
      required: ["name"] as const,
      properties: {
        name: { type: "string" as const, minLength: 1, maxLength: 200 },
      },
    },
    UpdateWorkspaceResponse: {
      type: "object" as const,
      required: ["workspace"] as const,
      properties: {
        workspace: { $ref: "#/components/schemas/WorkspaceDetail" },
      },
    },
    DeleteWorkspaceResponse: {
      type: "object" as const,
      required: ["success"] as const,
      properties: {
        success: { type: "boolean" as const, enum: [true] as const },
      },
    },
  },
};

const cutoverTelephonySecurity = [{ sessionCookie: [] }, { apiKey: [] }];
const cutoverDataPlaneSecurity = [{ sessionCookie: [] }, { apiKey: [] }];
const sessionOnlySecurity = [{ sessionCookie: [] }];

export const platformPathOverrides: Record<string, Record<string, unknown>> = {
  "/api/auth/register": {
    post: {
      summary: "Register a new user account",
      tags: ["Platform API", "Authentication"],
      parameters: [
        {
          name: "Idempotency-Key",
          in: "header",
          required: false,
          schema: { type: "string", maxLength: 256 },
          description: "Optional idempotency key for safe retries.",
        },
      ],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/RegisterRequest" },
          },
        },
      },
      responses: {
        "201": {
          description: "Account created",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/AuthTokensResponse" },
            },
          },
        },
        "400": errorResponse("Validation error"),
        "429": rateLimitResponse,
      },
    },
  },
  "/api/auth/token": {
    post: {
      summary: "Obtain access and refresh tokens",
      tags: ["Platform API", "Authentication"],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/TokenRequest" },
          },
        },
      },
      responses: {
        "200": {
          description: "Tokens issued",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/AuthTokensResponse" },
            },
          },
        },
        "401": errorResponse("Invalid credentials"),
        "429": rateLimitResponse,
      },
    },
  },
  "/api/auth/refresh": {
    post: {
      summary: "Refresh an access token",
      tags: ["Platform API", "Authentication"],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/RefreshRequest" },
          },
        },
      },
      responses: {
        "200": {
          description: "Tokens refreshed",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/AuthTokensResponse" },
            },
          },
        },
        "401": errorResponse("Invalid refresh token"),
        "429": rateLimitResponse,
      },
    },
  },
  "/api/auth/forgot-password": {
    post: {
      summary: "Request a password reset email",
      tags: ["Platform API", "Authentication"],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ForgotPasswordRequest" },
          },
        },
      },
      responses: {
        "200": { description: "Reset email sent if account exists" },
        "429": rateLimitResponse,
      },
    },
  },
  "/api/workspaces": {
    post: {
      summary: "Create a workspace",
      tags: ["Platform API", "Workspace"],
      parameters: [
        {
          name: "Idempotency-Key",
          in: "header",
          required: false,
          schema: { type: "string", maxLength: 256 },
        },
      ],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/CreateWorkspaceRequest" },
          },
        },
      },
      responses: {
        "201": {
          description: "Workspace created",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateWorkspaceResponse" },
            },
          },
        },
        "401": errorResponse("Unauthorized"),
      },
    },
  },
  "/api/workspaces/{workspaceId}": {
    get: {
      operationId: "getWorkspace",
      summary: "Get workspace details",
      tags: ["Platform API", "Workspace"],
      security: cutoverDataPlaneSecurity,
      description:
        "Returns workspace metadata for an authorized session member or workspace API key scoped to the route workspace.",
      responses: {
        "200": {
          description: "Workspace details",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/WorkspaceDetailResponse" },
            },
          },
        },
        "401": errorResponse("Unauthorized"),
        "404": errorResponse("Workspace not found"),
      },
    },
    patch: {
      operationId: "updateWorkspace",
      summary: "Update workspace settings",
      tags: ["Platform API", "Workspace"],
      security: sessionOnlySecurity,
      description: "Rename a workspace. Requires an admin-or-higher signed-in session.",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/UpdateWorkspaceRequest" },
          },
        },
      },
      responses: {
        "200": {
          description: "Workspace updated",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/UpdateWorkspaceResponse" },
            },
          },
        },
        "400": errorResponse("Validation error"),
        "401": errorResponse("Unauthorized"),
        "403": errorResponse("Admin role required"),
        "404": errorResponse("Workspace not found"),
      },
    },
    delete: {
      operationId: "deleteWorkspace",
      summary: "Delete a workspace",
      tags: ["Platform API", "Workspace"],
      security: sessionOnlySecurity,
      description: "Permanently delete a workspace. Owner session only.",
      responses: {
        "200": {
          description: "Workspace deleted",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/DeleteWorkspaceResponse" },
            },
          },
        },
        "400": errorResponse("Deletion blocked"),
        "401": errorResponse("Unauthorized"),
        "403": errorResponse("Owner role required"),
      },
    },
  },
  "/api/workspaces/{workspaceId}/campaigns/{campaignId}/dialer/start": {
    post: {
      operationId: "startCampaignDialer",
      summary: "Start auto-dial conference for a campaign",
      tags: ["Platform API", "Dialer", "Telephony"],
      "x-callcaster-capability": "calls.start",
      security: cutoverTelephonySecurity,
      description:
        "Authenticated caller+ session or workspace API key. API keys must supply `agentUserId` for a verified caller in the workspace.",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/DialerStartRequest" },
          },
        },
      },
      responses: {
        "200": {
          description: "Conference started",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/DialerStartResponse" },
            },
          },
        },
        "400": errorResponse("Validation error"),
        "401": errorResponse("Unauthorized"),
        "403": errorResponse("Insufficient role or MFA enrollment required"),
        "404": errorResponse("Campaign not found"),
      },
    },
  },
  "/api/workspaces/{workspaceId}/calls/{callSid}/disconnect": {
    post: {
      operationId: "disconnectWorkspaceCall",
      summary: "Disconnect an active workspace call",
      tags: ["Platform API", "Telephony"],
      "x-callcaster-capability": "calls.control",
      security: cutoverTelephonySecurity,
      description:
        "Pause/hang up a live call using workspace Twilio credentials. Requires session or API key scoped to the call workspace.",
      responses: {
        "200": {
          description: "Disconnect initiated",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CallDisconnectResponse" },
            },
          },
        },
        "401": errorResponse("Unauthorized"),
        "403": errorResponse("Forbidden"),
        "404": errorResponse("Call not found"),
        "500": errorResponse("Twilio disconnect failed"),
      },
    },
  },
  "/api/workspaces/{workspaceId}/audit-events": {
    get: {
      operationId: "listWorkspaceAuditEvents",
      summary: "List workspace audit events",
      tags: ["Platform API", "Workspace"],
      "x-callcaster-capability": "audit.read",
      security: [{ sessionCookie: [] }],
      description:
        "Cursor-paginated immutable audit log for privileged workspace actions. Owner session only until API key scopes ship in SEC-07.",
      parameters: [
        {
          name: "cursor",
          in: "query",
          required: false,
          schema: { type: "string" },
          description: "Opaque cursor from a previous page's next_cursor.",
        },
        {
          name: "limit",
          in: "query",
          required: false,
          schema: { type: "integer", minimum: 1, maximum: 100, default: 50 },
        },
      ],
      responses: {
        "200": {
          description: "Audit events page",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/WorkspaceAuditEventListResponse" },
            },
          },
        },
        "400": errorResponse("Invalid cursor"),
        "401": errorResponse("Unauthorized"),
        "403": errorResponse("Owner session required"),
      },
    },
  },
};
