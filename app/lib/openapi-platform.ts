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
    WorkspaceMemberRole: {
      type: "string" as const,
      enum: ["owner", "admin", "member", "caller"] as const,
    },
    ProductCapabilityId: {
      type: "string" as const,
      enum: [
        "campaigns.read",
        "campaigns.write",
        "campaigns.dispatch",
        "calls.start",
        "calls.control",
        "messages.send",
        "members.invite",
        "audit.read",
      ] as const,
      description: "Stable product capability ID used as an API-key scope.",
    },
    ApiKeySummary: {
      type: "object" as const,
      required: ["id", "name", "key_prefix", "created_at", "scopes"] as const,
      properties: {
        id: { type: "string" as const },
        name: { type: "string" as const },
        key_prefix: { type: "string" as const },
        created_at: { type: "string" as const, format: "date-time" },
        last_used_at: { type: "string" as const, format: "date-time", nullable: true },
        scopes: {
          type: "array" as const,
          items: { $ref: "#/components/schemas/ProductCapabilityId" },
        },
        expires_at: {
          type: "string" as const,
          format: "date-time",
          nullable: true,
          description: "ISO-8601 expiry; null only for pre-SEC-07 legacy keys.",
        },
      },
    },
    ApiKeyListResponse: {
      type: "object" as const,
      required: ["keys"] as const,
      properties: {
        keys: {
          type: "array" as const,
          items: { $ref: "#/components/schemas/ApiKeySummary" },
        },
      },
    },
    CreateApiKeyRequest: {
      type: "object" as const,
      required: ["name", "scopes"] as const,
      properties: {
        name: { type: "string" as const, minLength: 1, maxLength: 200 },
        scopes: {
          type: "array" as const,
          minItems: 1,
          items: { $ref: "#/components/schemas/ProductCapabilityId" },
          description: "At least one capability scope is required.",
        },
        expires_in_days: {
          type: "integer" as const,
          minimum: 1,
          maximum: 365,
          description: "Key TTL in days (default 90, max 365).",
        },
      },
    },
    CreateApiKeyResponse: {
      type: "object" as const,
      required: [
        "key",
        "id",
        "name",
        "key_prefix",
        "created_at",
        "scopes",
      ] as const,
      properties: {
        key: {
          type: "string" as const,
          description: "Full secret key; shown once at creation.",
        },
        id: { type: "string" as const },
        name: { type: "string" as const },
        key_prefix: { type: "string" as const },
        created_at: { type: "string" as const, format: "date-time" },
        scopes: {
          type: "array" as const,
          items: { $ref: "#/components/schemas/ProductCapabilityId" },
        },
        expires_at: {
          type: "string" as const,
          format: "date-time",
          nullable: true,
        },
      },
    },
    DeleteApiKeyRequest: {
      type: "object" as const,
      required: ["id"] as const,
      properties: {
        id: { type: "string" as const, format: "uuid" },
      },
    },
    WorkspaceMember: {
      type: "object" as const,
      required: ["user_id", "username", "role"] as const,
      properties: {
        user_id: { type: "string" as const, format: "uuid" },
        username: { type: "string" as const, nullable: true },
        first_name: { type: "string" as const, nullable: true },
        last_name: { type: "string" as const, nullable: true },
        role: { $ref: "#/components/schemas/WorkspaceMemberRole" },
      },
    },
    WorkspaceInvite: {
      type: "object" as const,
      properties: {
        id: { type: "integer" as const },
        user_id: { type: "string" as const, format: "uuid" },
        role: { $ref: "#/components/schemas/WorkspaceMemberRole" },
        created_at: { type: "string" as const, format: "date-time", nullable: true },
        user: {
          type: "object" as const,
          nullable: true,
          properties: {
            id: { type: "string" as const, format: "uuid" },
            username: { type: "string" as const, nullable: true },
            first_name: { type: "string" as const, nullable: true },
            last_name: { type: "string" as const, nullable: true },
          },
        },
      },
    },
    WorkspaceMembersListResponse: {
      type: "object" as const,
      required: ["members", "pending_invites"] as const,
      properties: {
        members: {
          type: "array" as const,
          items: { $ref: "#/components/schemas/WorkspaceMember" },
        },
        pending_invites: {
          type: "array" as const,
          items: { $ref: "#/components/schemas/WorkspaceInvite" },
        },
      },
    },
    InviteMemberRequest: {
      type: "object" as const,
      required: ["email", "role"] as const,
      properties: {
        email: { type: "string" as const, format: "email" },
        role: { $ref: "#/components/schemas/WorkspaceMemberRole" },
      },
    },
    InviteMemberResponse: {
      type: "object" as const,
      required: ["success"] as const,
      properties: {
        success: { type: "boolean" as const, enum: [true] as const },
        invite: { $ref: "#/components/schemas/WorkspaceInvite" },
        warning: { type: "string" as const },
      },
    },
    UpdateMemberRequest: {
      type: "object" as const,
      required: ["user_id", "role"] as const,
      properties: {
        user_id: { type: "string" as const, format: "uuid" },
        role: { $ref: "#/components/schemas/WorkspaceMemberRole" },
      },
    },
    UpdateMemberResponse: {
      type: "object" as const,
      required: ["member"] as const,
      properties: {
        member: { $ref: "#/components/schemas/WorkspaceMember" },
      },
    },
    DeleteMemberRequest: {
      type: "object" as const,
      required: ["user_id"] as const,
      properties: {
        user_id: { type: "string" as const, format: "uuid" },
        target: { type: "string" as const, enum: ["member", "invite"] as const },
      },
    },
    WorkspaceWebhookConfig: {
      type: "object" as const,
      properties: {
        id: { type: "integer" as const },
        destination_url: { type: "string" as const, format: "uri" },
        events: { type: "array" as const, items: { type: "string" as const } },
        custom_headers: {
          type: "object" as const,
          additionalProperties: { type: "string" as const },
        },
        created_at: { type: "string" as const, format: "date-time", nullable: true },
        updated_at: { type: "string" as const, format: "date-time", nullable: true },
      },
    },
    WorkspaceWebhookResponse: {
      type: "object" as const,
      required: ["webhook"] as const,
      properties: {
        webhook: {
          allOf: [{ $ref: "#/components/schemas/WorkspaceWebhookConfig" }],
          nullable: true,
        },
      },
    },
    UpsertWebhookRequest: {
      type: "object" as const,
      required: ["destination_url", "events"] as const,
      properties: {
        destination_url: { type: "string" as const, format: "uri" },
        events: {
          type: "array" as const,
          items: { type: "string" as const },
          minItems: 1,
        },
        custom_headers: {
          type: "object" as const,
          additionalProperties: { type: "string" as const },
        },
        webhook_id: { type: "integer" as const },
      },
    },
    TestWebhookRequest: {
      type: "object" as const,
      required: ["destination_url", "event"] as const,
      properties: {
        destination_url: { type: "string" as const, format: "uri" },
        custom_headers: {
          type: "object" as const,
          additionalProperties: { type: "string" as const },
        },
        event: { type: "object" as const, additionalProperties: true },
      },
    },
    TestWebhookResponse: {
      type: "object" as const,
      properties: {
        data: {},
        status: { type: "integer" as const },
        statusText: { type: "string" as const },
      },
    },
    TransferOwnershipRequest: {
      type: "object" as const,
      required: ["new_owner_user_id"] as const,
      properties: {
        new_owner_user_id: { type: "string" as const, format: "uuid" },
      },
    },
    TransferOwnershipResponse: {
      type: "object" as const,
      required: ["success", "new_owner_user_id"] as const,
      properties: {
        success: { type: "boolean" as const, enum: [true] as const },
        new_owner_user_id: { type: "string" as const, format: "uuid" },
      },
    },
    WorkspacePhoneNumber: {
      type: "object" as const,
      properties: {
        id: { type: "integer" as const },
        phone_number: { type: "string" as const },
        friendly_name: { type: "string" as const, nullable: true },
        inbound_action: { type: "string" as const, nullable: true },
        handset_enabled: { type: "boolean" as const, nullable: true },
      },
      additionalProperties: true,
    },
    WorkspaceNumbersListResponse: {
      type: "object" as const,
      required: ["numbers"] as const,
      properties: {
        numbers: {
          type: "array" as const,
          items: { $ref: "#/components/schemas/WorkspacePhoneNumber" },
        },
      },
    },
    PurchaseNumberRequest: {
      type: "object" as const,
      required: ["phone_number"] as const,
      properties: {
        phone_number: { type: "string" as const, minLength: 1 },
      },
    },
    PurchaseNumberResponse: {
      type: "object" as const,
      required: ["number"] as const,
      properties: {
        number: { $ref: "#/components/schemas/WorkspacePhoneNumber" },
        messagingServiceAttached: { type: "boolean" as const },
        messagingServiceAttachError: { type: "string" as const },
        partialSuccess: { type: "boolean" as const },
      },
    },
    PatchNumberRequest: {
      type: "object" as const,
      properties: {
        friendly_name: { type: "string" as const, minLength: 1 },
        inbound_action: { type: "string" as const },
        inbound_audio: { type: "string" as const, nullable: true },
        inbound_ring_count: { type: "integer" as const, minimum: 1, maximum: 10 },
        inbound_queue_id: { type: "integer" as const, nullable: true },
        inbound_script_id: { type: "integer" as const, nullable: true },
        handset_enabled: { type: "boolean" as const },
      },
    },
    PatchNumberResponse: {
      type: "object" as const,
      required: ["number"] as const,
      properties: {
        number: { $ref: "#/components/schemas/WorkspacePhoneNumber" },
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
      "x-callcaster-capability": "campaigns.read",
      security: cutoverDataPlaneSecurity,
      description:
        "Returns workspace metadata for an authorized session member or workspace API key with campaigns.read scoped to the route workspace.",
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
      security: cutoverDataPlaneSecurity,
      description:
        "Cursor-paginated immutable audit log for privileged workspace actions. Requires owner session or an API key with the audit.read capability.",
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
  "/api/workspaces/{workspaceId}/api-keys": {
    get: {
      operationId: "listWorkspaceApiKeys",
      summary: "List workspace API keys",
      tags: ["Platform API", "Workspace"],
      security: sessionOnlySecurity,
      description: "Session-only trust-root route. Lists key metadata without secrets.",
      responses: {
        "200": {
          description: "API keys",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ApiKeyListResponse" },
            },
          },
        },
        "401": errorResponse("Unauthorized"),
        "403": errorResponse("Member manager role required"),
      },
    },
    post: {
      operationId: "createWorkspaceApiKey",
      summary: "Create a workspace API key",
      tags: ["Platform API", "Workspace"],
      security: sessionOnlySecurity,
      description:
        "Session-only trust-root route. Returns the full secret once; store it immediately.",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/CreateApiKeyRequest" },
          },
        },
      },
      responses: {
        "201": {
          description: "API key created",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateApiKeyResponse" },
            },
          },
        },
        "400": errorResponse("Validation error"),
        "401": errorResponse("Unauthorized"),
        "403": errorResponse("Member manager role required"),
      },
    },
    delete: {
      operationId: "deleteWorkspaceApiKey",
      summary: "Revoke a workspace API key",
      tags: ["Platform API", "Workspace"],
      security: sessionOnlySecurity,
      description: "Session-only trust-root route.",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/DeleteApiKeyRequest" },
          },
        },
      },
      responses: {
        "200": {
          description: "API key revoked",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/DeleteWorkspaceResponse" },
            },
          },
        },
        "400": errorResponse("Validation error"),
        "401": errorResponse("Unauthorized"),
        "403": errorResponse("Member manager role required"),
      },
    },
  },
  "/api/workspaces/{workspaceId}/members": {
    get: {
      operationId: "listWorkspaceMembers",
      summary: "List workspace members and pending invites",
      tags: ["Platform API", "Workspace"],
      security: sessionOnlySecurity,
      description: "Session-only trust-root route.",
      responses: {
        "200": {
          description: "Members and invites",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/WorkspaceMembersListResponse" },
            },
          },
        },
        "401": errorResponse("Unauthorized"),
      },
    },
    post: {
      operationId: "inviteWorkspaceMember",
      summary: "Invite a workspace member",
      tags: ["Platform API", "Workspace"],
      "x-callcaster-capability": "members.invite",
      security: cutoverDataPlaneSecurity,
      description:
        "Invite a member with a session (role subordination rules apply) or an API key with members.invite (admin-equivalent role assignment: member/caller only). Privileged session role assignment may require MFA enrollment.",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/InviteMemberRequest" },
          },
        },
      },
      responses: {
        "201": {
          description: "Invite sent",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/InviteMemberResponse" },
            },
          },
        },
        "400": errorResponse("Validation error"),
        "401": errorResponse("Unauthorized"),
        "403": errorResponse("Member manager role required or MFA enrollment required"),
      },
    },
    patch: {
      operationId: "updateWorkspaceMemberRole",
      summary: "Update a member role",
      tags: ["Platform API", "Workspace"],
      security: sessionOnlySecurity,
      description:
        "Session-only trust-root route. Owner-role changes require an owner actor with MFA.",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/UpdateMemberRequest" },
          },
        },
      },
      responses: {
        "200": {
          description: "Member updated",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/UpdateMemberResponse" },
            },
          },
        },
        "400": errorResponse("Validation error"),
        "401": errorResponse("Unauthorized"),
        "403": errorResponse("Insufficient role or MFA enrollment required"),
        "404": errorResponse("Member not found"),
      },
    },
    delete: {
      operationId: "removeWorkspaceMember",
      summary: "Remove a member or cancel an invite",
      tags: ["Platform API", "Workspace"],
      security: sessionOnlySecurity,
      description:
        "Session-only trust-root route. Pass `target: invite` to cancel a pending invite.",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/DeleteMemberRequest" },
          },
        },
      },
      responses: {
        "200": {
          description: "Member removed or invite cancelled",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/DeleteWorkspaceResponse" },
            },
          },
        },
        "400": errorResponse("Validation error"),
        "401": errorResponse("Unauthorized"),
        "403": errorResponse("Member manager role required"),
        "404": errorResponse("Member or invite not found"),
      },
    },
  },
  "/api/workspaces/{workspaceId}/webhook": {
    get: {
      operationId: "getWorkspaceWebhook",
      summary: "Get workspace webhook configuration",
      tags: ["Platform API", "Workspace"],
      security: sessionOnlySecurity,
      description: "Session-only trust-root route.",
      responses: {
        "200": {
          description: "Webhook config",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/WorkspaceWebhookResponse" },
            },
          },
        },
        "401": errorResponse("Unauthorized"),
        "403": errorResponse("Member manager role required"),
      },
    },
    put: {
      operationId: "upsertWorkspaceWebhook",
      summary: "Create or update workspace webhook",
      tags: ["Platform API", "Workspace"],
      security: sessionOnlySecurity,
      description:
        "Session-only trust-root route. Destination URL must pass SSRF-safe outbound validation.",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/UpsertWebhookRequest" },
          },
        },
      },
      responses: {
        "200": {
          description: "Webhook saved",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/WorkspaceWebhookResponse" },
            },
          },
        },
        "400": errorResponse("Validation error or blocked destination URL"),
        "401": errorResponse("Unauthorized"),
        "403": errorResponse("Member manager role required"),
      },
    },
    post: {
      operationId: "testWorkspaceWebhook",
      summary: "Send a test webhook payload",
      tags: ["Platform API", "Workspace"],
      security: sessionOnlySecurity,
      description:
        "Session-only trust-root route. Delivers a sample event via safe outbound fetch.",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/TestWebhookRequest" },
          },
        },
      },
      responses: {
        "200": {
          description: "Test delivery result",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/TestWebhookResponse" },
            },
          },
        },
        "400": errorResponse("Validation error or blocked destination URL"),
        "401": errorResponse("Unauthorized"),
        "403": errorResponse("Member manager role required"),
      },
    },
  },
  "/api/workspaces/{workspaceId}/transfer-ownership": {
    post: {
      operationId: "transferWorkspaceOwnership",
      summary: "Transfer workspace ownership",
      tags: ["Platform API", "Workspace"],
      security: sessionOnlySecurity,
      description:
        "Owner session only. The incoming owner must have MFA enrolled (SEC-08).",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/TransferOwnershipRequest" },
          },
        },
      },
      responses: {
        "200": {
          description: "Ownership transferred",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/TransferOwnershipResponse" },
            },
          },
        },
        "400": errorResponse("Transfer blocked"),
        "401": errorResponse("Unauthorized"),
        "403": errorResponse("Owner session and new-owner MFA required"),
      },
    },
  },
  "/api/workspaces/{workspaceId}/numbers": {
    get: {
      operationId: "listWorkspaceNumbers",
      summary: "List workspace phone numbers",
      tags: ["Platform API", "Workspace", "Telephony"],
      security: sessionOnlySecurity,
      responses: {
        "200": {
          description: "Phone numbers",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/WorkspaceNumbersListResponse" },
            },
          },
        },
        "401": errorResponse("Unauthorized"),
      },
    },
    post: {
      operationId: "purchaseWorkspaceNumber",
      summary: "Purchase and provision a phone number",
      tags: ["Platform API", "Workspace", "Telephony"],
      security: sessionOnlySecurity,
      description: "Requires sufficient workspace credits and numbers-manager role.",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/PurchaseNumberRequest" },
          },
        },
      },
      responses: {
        "200": {
          description: "Number purchased",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/PurchaseNumberResponse" },
            },
          },
        },
        "402": errorResponse("Insufficient credits"),
        "400": errorResponse("Validation error"),
        "401": errorResponse("Unauthorized"),
        "403": errorResponse("Numbers manager role required"),
      },
    },
  },
  "/api/workspaces/{workspaceId}/numbers/{numberId}": {
    patch: {
      operationId: "patchWorkspaceNumber",
      summary: "Update phone number settings",
      tags: ["Platform API", "Workspace", "Telephony"],
      security: sessionOnlySecurity,
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/PatchNumberRequest" },
          },
        },
      },
      responses: {
        "200": {
          description: "Number updated",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/PatchNumberResponse" },
            },
          },
        },
        "400": errorResponse("Validation error"),
        "401": errorResponse("Unauthorized"),
        "403": errorResponse("Numbers manager role required"),
        "404": errorResponse("Number not found"),
      },
    },
    delete: {
      operationId: "deleteWorkspaceNumber",
      summary: "Release a workspace phone number",
      tags: ["Platform API", "Workspace", "Telephony"],
      security: sessionOnlySecurity,
      responses: {
        "200": {
          description: "Number released",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/DeleteWorkspaceResponse" },
            },
          },
        },
        "401": errorResponse("Unauthorized"),
        "403": errorResponse("Numbers manager role required"),
        "404": errorResponse("Number not found"),
      },
    },
  },
};
