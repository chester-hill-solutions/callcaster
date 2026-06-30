import { requireSudo } from "@/lib/api-auth.server";
import { parseJsonBodyOrResponse } from "@/lib/api-parse.server";
import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import { dispatchAdminTwilioAction } from "@/lib/platform-admin-twilio.server";
import { z } from "zod";
import type { ActionFunctionArgs } from "react-router";

const twilioActionSchema = z.object({
  action: z.string().min(1),
  payload: z.record(z.string(), z.unknown()).optional(),
});

export async function action({ request, params }: ActionFunctionArgs) {
  const auth = await requireSudo(request);
  if (auth instanceof Response) return auth;

  const workspaceId = params.workspaceId;
  if (!workspaceId) {
    return jsonError("workspaceId is required", 400);
  }

  if (request.method !== "POST") {
    return jsonError("Method not allowed", 405);
  }

  const parsed = await parseJsonBodyOrResponse(request, twilioActionSchema);
  if (parsed instanceof Response) return parsed;

  const result = await dispatchAdminTwilioAction({workspaceId,
    actorUserId: auth.user.id,
    actorUsername: auth.userData.username ?? null,
    actionName: parsed.action,
    payload: parsed.payload ?? {},
  });

  if (!result.ok) {
    return jsonError(result.error, result.status ?? 500);
  }

  return jsonResponse({ success: true, message: result.message });
}
