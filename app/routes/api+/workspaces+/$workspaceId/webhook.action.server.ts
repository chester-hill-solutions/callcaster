import { parseJsonBodyOrResponse } from "@/lib/api-parse.server";
import {
  testWebhookBodySchema,
  upsertWebhookBodySchema,
} from "@/lib/schemas/api/platform-workspace-admin";
import {
  getWorkspaceWebhook,
  testWorkspaceWebhook,
  upsertWorkspaceWebhook,
} from "@/lib/platform-members.server";
import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import { getDataPlaneRouteContext } from "@/lib/data-plane-route.server";
import { defineAction, defineLoader } from "@/lib/handler.server";
import type { LoaderFunctionArgs } from "react-router";

function requireWorkspaceUser({
  params,
  context,
}: Pick<LoaderFunctionArgs, "params" | "context">) {
  const workspaceId = params.workspaceId;
  if (!workspaceId) {
    return jsonError("workspaceId is required", 400);
  }
  const { userId } = getDataPlaneRouteContext(context, workspaceId);
  if (!userId) {
    return jsonError("Unauthorized", 401);
  }
  return { workspaceId, userId };
}

export const loader = defineLoader({
  auth: requireWorkspaceUser,
  sideEffects: ["db-read"],
  handler: async ({ auth }) => {
    const result = await getWorkspaceWebhook(    auth.userId,
      auth.workspaceId,
    );

    if (!result.ok) {
      return jsonError(result.error, result.status);
    }

    return jsonResponse({ webhook: result.webhook }, 200);
  },
});

export const action = defineAction({
  auth: requireWorkspaceUser,
  sideEffects: ["db-write", "external"],
  handler: async ({ request, auth }) => {
    const { workspaceId, userId } = auth;

    if (request.method === "PUT") {
      const parsed = await parseJsonBodyOrResponse(request, upsertWebhookBodySchema);
      if (parsed instanceof Response) return parsed;

      const result = await upsertWorkspaceWebhook(
        userId,
        workspaceId,
        parsed,
      );

      if (!result.ok) {
        return jsonError(result.error, result.status);
      }

      return jsonResponse({ webhook: result.webhook }, 200);
    }

    if (request.method === "POST") {
      const parsed = await parseJsonBodyOrResponse(request, testWebhookBodySchema);
      if (parsed instanceof Response) return parsed;

      const result = await testWorkspaceWebhook(
        parsed.destination_url,
        parsed.custom_headers as Record<string, string> | [string, string][],
        parsed.event,
      );

      if (!result.ok) {
        return jsonError(result.error, result.status);
      }

      return jsonResponse(
        {
          data: result.data,
          status: result.status,
          statusText: result.statusText,
        },
        200,
      );
    }

    return jsonError("Method not allowed", 405);
  },
});
