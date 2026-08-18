/**
 * Detailed OpenAPI path overrides for Platform / agent-friendly CaaS routes.
 * Components live in openapi-platform-components.ts.
 */
import {
  errorResponse,
  rateLimitResponse,
} from "@/lib/openapi-platform-components";

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
      description:
        "Session-only trust-root route. Lists key metadata without secrets.",
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
        "403": errorResponse("Workspace admin role required"),
      },
    },
    post: {
      operationId: "createWorkspaceApiKey",
      summary: "Create a workspace API key",
      tags: ["Platform API", "Workspace"],
      security: sessionOnlySecurity,
      description:
        "Session-only trust-root route. Requires a workspace admin session. " +
        "Requested scopes are capped at the capabilities the creating member's " +
        "role holds — a scope outside that set is rejected with 403 naming it. " +
        "Returns the full secret once; store it immediately.",
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
        "403": errorResponse(
          "Workspace admin role required, or a requested scope exceeds the creator's role capabilities",
        ),
      },
    },
    delete: {
      operationId: "deleteWorkspaceApiKey",
      summary: "Revoke a workspace API key",
      tags: ["Platform API", "Workspace"],
      security: sessionOnlySecurity,
      description: "Session-only trust-root route. Requires a workspace admin session.",
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
        "403": errorResponse("Workspace admin role required"),
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
