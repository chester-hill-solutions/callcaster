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
  },
};

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
};
