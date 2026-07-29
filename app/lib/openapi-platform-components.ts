/**
 * Shared OpenAPI components (schemas, security schemes, canned responses)
 * for Platform / agent-friendly CaaS routes. Split from openapi-platform.ts
 * for the app file-size gate (#1048).
 */
export const errorResponse = (description: string) => ({
  description,
  content: {
    "application/json": {
      schema: { $ref: "#/components/schemas/PlatformError" },
    },
  },
});

export const rateLimitResponse = {
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
