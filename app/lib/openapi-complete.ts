/**
 * Complete classified OpenAPI 3.0 spec for all CallCaster HTTP API surfaces.
 * Served at /api/docs/openapi/all — not the integrator SDK contract.
 */
import {
  API_SURFACE,
  AUTH_CLASS_TAGS,
  type ApiSurfaceEntry,
  type ApiSurfaceOperation,
  type AuthClass,
  type BodyType,
} from "@/lib/api-surface";
import { openApiSpec } from "@/lib/openapi";
import { PUBLIC_API_PATHS } from "@/lib/public-api";

const broadObjectSchema = {
  type: "object" as const,
  additionalProperties: true,
};

const errorResponse = (description: string) => ({
  description,
  content: {
    "application/json": {
      schema: { $ref: "#/components/schemas/Error" },
    },
  },
});

const twimlResponse = {
  description: "TwiML XML response",
  content: {
    "text/xml": {
      schema: { type: "string" as const },
    },
  },
};

function contentTypeForBody(bodyType: BodyType): string {
  switch (bodyType) {
    case "json":
      return "application/json";
    case "form":
      return "application/x-www-form-urlencoded";
    case "multipart":
      return "multipart/form-data";
    case "rawWebhook":
      return "application/json";
    case "twiml":
      return "application/x-www-form-urlencoded";
    case "query":
      return "application/json";
    default: {
      const _exhaustive: never = bodyType;
      return _exhaustive;
    }
  }
}

function requestBodyForOperation(op: ApiSurfaceOperation) {
  if (op.method === "GET" || op.method === "DELETE") {
    return undefined;
  }
  if (op.bodyType === "rawWebhook") {
    return {
      required: true,
      content: {
        "application/json": {
          schema: broadObjectSchema,
          description: "Raw webhook payload; verify provider signature.",
        },
      },
    };
  }
  return {
    required: true,
    content: {
      [contentTypeForBody(op.bodyType)]: {
        schema: broadObjectSchema,
        description:
          op.bodyType === "form"
            ? "Twilio or HTML form fields."
            : "Request body; see human docs for field details.",
      },
    },
  };
}

function responsesForEntry(entry: ApiSurfaceEntry, op: ApiSurfaceOperation) {
  const publicPath = PUBLIC_API_PATHS.find((p) => p === entry.path);
  if (publicPath && op.method === "POST") {
    const publicOp =
      openApiSpec.paths[publicPath as keyof typeof openApiSpec.paths]?.post;
    if (publicOp?.responses) {
      return publicOp.responses;
    }
  }

  if (op.bodyType === "twiml" || entry.notes?.includes("TwiML")) {
    return {
      "200": twimlResponse,
      "403": errorResponse("Forbidden or invalid signature"),
    };
  }

  if (entry.authClass === "twilioSignature") {
    return {
      "200": {
        description: "Webhook processed",
        content: {
          "application/json": { schema: broadObjectSchema },
          "text/xml": { schema: { type: "string" as const } },
        },
      },
      "403": errorResponse("Invalid Twilio signature"),
    };
  }

  if (entry.authClass === "stripeSignature") {
    return {
      "200": { description: "Event acknowledged" },
      "400": errorResponse("Invalid Stripe signature or payload"),
    };
  }

  return {
    "200": {
      description: entry.supported ? "Success" : "Success (session/internal route)",
      content: {
        "application/json": { schema: broadObjectSchema },
      },
    },
    "401": errorResponse("Unauthorized"),
    "403": errorResponse("Forbidden"),
  };
}

function securityForAuth(authClass: AuthClass) {
  switch (authClass) {
    case "apiKeyOrSession":
      return [{ sessionCookie: [] }, { apiKey: [] }];
    case "session":
    case "workspaceAdmin":
      return [{ sessionCookie: [] }];
    case "twilioSignature":
    case "stripeSignature":
    case "publicForm":
    case "internalTrusted":
    case "weakUnknown":
      return [];
    default: {
      const _exhaustive: never = authClass;
      return _exhaustive;
    }
  }
}

function operationId(path: string, method: string): string {
  const slug = path
    .replace(/^\/api\//, "")
    .replace(/[:/{}]/g, "_")
    .replace(/-/g, "_")
    .replace(/__+/g, "_");
  return `${method.toLowerCase()}${slug.charAt(0).toUpperCase()}${slug.slice(1)}`;
}

function buildCompletePaths() {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const entry of API_SURFACE) {
    if (entry.specTarget === "inventoryOnly") {
      continue;
    }
    if (entry.duplicate && entry.routeModule.endsWith(".js")) {
      continue;
    }

    const pathItem = paths[entry.path] ?? {};
    for (const op of entry.operations) {
      const method = op.method.toLowerCase();
      const tag = AUTH_CLASS_TAGS[entry.authClass];
      pathItem[method] = {
        operationId: operationId(entry.path, op.method),
        summary: `${op.method} ${entry.path}`,
        description: [
          entry.notes,
          entry.securityWarning ? `**Security:** ${entry.securityWarning}` : null,
          entry.duplicate ? "Duplicate/legacy route registration." : null,
          entry.supported
            ? null
            : "**Not supported for external integrators.** Session, webhook, or internal use only.",
        ]
          .filter(Boolean)
          .join("\n\n"),
        tags: [tag, entry.ownerArea],
        "x-callcaster-supported": entry.supported,
        "x-callcaster-exposure": entry.exposure,
        "x-callcaster-auth-class": entry.authClass,
        "x-callcaster-docs-guide": entry.docsGuide,
        security: securityForAuth(entry.authClass),
        ...(op.method === "GET"
          ? {
              parameters: [
                {
                  name: "workspace_id",
                  in: "query",
                  schema: { type: "string", format: "uuid" },
                  description: "Workspace scope when applicable.",
                },
              ],
            }
          : {}),
        ...(requestBodyForOperation(op)
          ? { requestBody: requestBodyForOperation(op) }
          : {}),
        responses: responsesForEntry(entry, op),
      };
    }
    paths[entry.path] = pathItem;
  }

  return paths;
}

const completeTags = [
  ...new Set(Object.values(AUTH_CLASS_TAGS)),
].map((name) => ({
  name,
  description:
    name === "Public API"
      ? "Integrator-facing JSON APIs (also in public OpenAPI spec)."
      : name === "Security Gap"
        ? "Callable routes with weak or unknown auth — not for integrator use."
        : `${name} routes in the complete surface inventory.`,
}));

export const completeOpenApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "CallCaster Complete API Surface",
    description:
      "Classified inventory of all callable CallCaster HTTP API routes: public SDK, session, workspace admin, provider webhooks, public forms, internal/trusted, and documented security gaps. For integrator use, prefer the public spec at /api/docs/openapi (POST /api/campaigns/create-with-script, POST /api/chat_sms, POST /api/sms only).",
    version: "1.0.0",
  },
  servers: [{ url: "/", description: "Current origin" }],
  tags: completeTags,
  paths: buildCompletePaths(),
  components: {
    securitySchemes: openApiSpec.components.securitySchemes,
    schemas: {
      ...openApiSpec.components.schemas,
    },
  },
} as const;
