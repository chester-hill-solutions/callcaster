import { data as routeData } from "react-router";
import { requireJsonAuth } from "@/lib/api-auth.server";
import { defineAction } from "@/lib/handler.server";
import { testWorkspaceWebhook } from "@/lib/platform-members.server";
import { testWebhookBodySchema } from "@/lib/schemas/api/common";
import { testWebhookBodySchema as deliverySchema } from "@/lib/schemas/api/platform-workspace-admin";

export const action = defineAction({
  auth: ({ request }) => requireJsonAuth(request),
  input: testWebhookBodySchema,
  sideEffects: ["db-read", "db-write", "external"],
  handler: async ({ request, auth, input }) => {
    if (request.method !== "POST") {
      return routeData({ error: "Method not allowed" }, { status: 405 });
    }
    if (!input.workspace_id) {
      return routeData({ error: "Workspace not found" }, { status: 404 });
    }

    let event: unknown;
    let customHeaders: unknown;
    try {
      event = JSON.parse(input.event);
      customHeaders = JSON.parse(input.custom_headers);
    } catch {
      return routeData({ error: "Invalid JSON payload" }, { status: 400 });
    }

    const parsed = deliverySchema.safeParse({
      event,
      destination_url: input.destination_url,
      custom_headers: customHeaders,
    });
    if (!parsed.success) {
      return routeData({ error: "Invalid input" }, { status: 400 });
    }

    const result = await testWorkspaceWebhook(
      auth.user.id,
      input.workspace_id,
      parsed.data.destination_url,
      parsed.data.custom_headers,
      parsed.data.event,
    );
    if (result instanceof Response) return result;
    if (!result.ok) {
      return routeData({ error: result.error }, { status: result.status });
    }
    return routeData({
      data: result.data,
      status: result.status,
      statusText: result.statusText,
      error: null,
    });
  },
});
