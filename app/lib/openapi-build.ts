import type {
  ApiSurfaceEntry,
  ApiSurfaceOperation,
  AuthClass,
  BodyType,
  OwnerArea,
} from "@/lib/api-surface-types";
import { AUTH_CLASS_TAGS } from "@/lib/api-surface-types";
import {
  integratorOpenApiComponents,
  integratorPathOverrides,
} from "@/lib/openapi-integrator";
import {
  platformOpenApiComponents,
  platformPathOverrides,
} from "@/lib/openapi-platform";

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

const OWNER_AREA_TAGS: Record<OwnerArea, string> = {
  auth: "Authentication",
  campaigns: "Campaigns",
  contacts: "Contacts",
  audiences: "Audiences",
  scripts: "Scripts",
  queues: "Queues",
  messaging: "Messaging",
  telephony: "Telephony",
  ivr: "IVR",
  inbound: "Inbound",
  handset: "Handset",
  dialer: "Dialer",
  workspace: "Workspace",
  analytics: "Analytics & Export",
  billing: "Billing",
  surveys: "Surveys",
  media: "Media",
  docs: "Documentation",
  misc: "Misc",
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
            ? "Form fields (JSON or multipart where noted in human docs)."
            : "Request body; see human docs for field details.",
      },
    },
  };
}

function responsesForEntry(entry: ApiSurfaceEntry, op: ApiSurfaceOperation) {
  if (op.bodyType === "twiml" || entry.notes?.includes("TwiML")) {
    return {
      "200": twimlResponse,
      "401": errorResponse("Unauthorized"),
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
      description: "Success",
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
    case "publicForm":
      return [];
    case "twilioSignature":
    case "stripeSignature":
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

export type BuildOpenApiSpecOptions = {
  entries: readonly ApiSurfaceEntry[];
  title: string;
  description: string;
  /** Group operations by owner area (public user docs) or auth class (complete inventory). */
  tagStrategy: "owner" | "auth";
  /** Merge detailed integrator path definitions (schemas, examples). */
  useIntegratorPathOverrides?: boolean;
  /** Merge detailed platform path definitions (auth, workspaces). */
  usePlatformPathOverrides?: boolean;
  /** Append integrator JSON schemas to components. */
  includeIntegratorSchemas?: boolean;
  /** Append platform JSON schemas to components. */
  includePlatformSchemas?: boolean;
  unsupportedDescription?: string;
};

function tagsForEntry(
  entry: ApiSurfaceEntry,
  tagStrategy: BuildOpenApiSpecOptions["tagStrategy"],
): string[] {
  if (tagStrategy === "owner") {
    return [OWNER_AREA_TAGS[entry.ownerArea], AUTH_CLASS_TAGS[entry.authClass]];
  }
  return [AUTH_CLASS_TAGS[entry.authClass], entry.ownerArea];
}

export function buildOpenApiSpec(options: BuildOpenApiSpecOptions) {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const entry of options.entries) {
    if (entry.duplicate && entry.routeModule.endsWith(".js")) {
      continue;
    }

    const pathItem = paths[entry.path] ?? {};
    for (const op of entry.operations) {
      const method = op.method.toLowerCase();
      pathItem[method] = {
        operationId: operationId(entry.path, op.method),
        summary: `${op.method} ${entry.path}`,
        description: [
          entry.notes,
          entry.securityWarning ? `**Security:** ${entry.securityWarning}` : null,
          entry.duplicate ? "Duplicate/legacy route registration." : null,
          entry.supported
            ? null
            : (options.unsupportedDescription ??
              "**Not supported.** See complete API surface docs."),
        ]
          .filter(Boolean)
          .join("\n\n"),
        tags: tagsForEntry(entry, options.tagStrategy),
        "x-callcaster-supported": entry.supported,
        "x-callcaster-exposure": entry.exposure,
        "x-callcaster-auth-class": entry.authClass,
        "x-callcaster-docs-guide": entry.docsGuide,
        security: securityForAuth(entry.authClass),
        ...(entry.workspaceScoped && op.method === "GET"
          ? {
              parameters: [
                {
                  name: "workspace_id",
                  in: "query",
                  schema: { type: "string", format: "uuid" },
                  description: "Workspace scope (required for session auth).",
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

  if (options.useIntegratorPathOverrides) {
    for (const [path, override] of Object.entries(integratorPathOverrides)) {
      paths[path] = { ...paths[path], ...override };
    }
  }

  if (options.usePlatformPathOverrides) {
    for (const [path, override] of Object.entries(platformPathOverrides)) {
      paths[path] = { ...paths[path], ...override };
    }
  }

  const tagNames = new Set<string>();
  for (const entry of options.entries) {
    for (const tag of tagsForEntry(entry, options.tagStrategy)) {
      tagNames.add(tag);
    }
  }
  if (options.useIntegratorPathOverrides) {
    tagNames.add("Integrator API");
    tagNames.add("Campaigns");
    tagNames.add("Messaging");
  }
  if (options.usePlatformPathOverrides) {
    tagNames.add("Platform API");
  }

  const tags = [...tagNames].sort().map((name) => ({
    name,
    description:
      name === "Integrator API"
        ? "Automation-friendly JSON endpoints (API key or session)."
        : name === "Workspace"
          ? "Workspace settings, API keys, numbers, and admin."
          : `${name} endpoints.`,
  }));

  return {
    openapi: "3.0.3",
    info: {
      title: options.title,
      description: options.description,
      version: "1.0.0",
    },
    servers: [{ url: "/", description: "Current origin" }],
    tags,
    paths,
    components: {
      securitySchemes: integratorOpenApiComponents.securitySchemes,
      schemas: {
        Error: integratorOpenApiComponents.schemas.Error,
        ...(options.includeIntegratorSchemas
          ? integratorOpenApiComponents.schemas
          : {}),
        ...(options.includePlatformSchemas
          ? platformOpenApiComponents.schemas
          : {}),
      },
    },
  } as const;
}
