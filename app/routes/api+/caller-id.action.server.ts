import {
  getAuthSupabaseClient,
  requireJsonAuth,
} from "@/lib/api-auth.server";
import { parseJsonBodyOrResponse } from "@/lib/api-parse.server";
import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import { verifyWorkspaceCallerId } from "@/lib/platform-workspace-numbers.server";
import { z } from "zod";
import type { ActionFunctionArgs } from "react-router";

const legacyCallerIdBodySchema = z
  .object({
    workspace_id: z.string().uuid(),
    phone_number: z.string().min(1).optional(),
    phoneNumber: z.string().min(1).optional(),
    friendly_name: z.string().min(1).optional(),
    friendlyName: z.string().min(1).optional(),
  })
  .refine(
    (value) =>
      Boolean(value.phone_number ?? value.phoneNumber) &&
      Boolean(value.friendly_name ?? value.friendlyName),
    { message: "phone_number and friendly_name are required" },
  )
  .transform((value) => ({
    workspace_id: value.workspace_id,
    phone_number: value.phone_number ?? value.phoneNumber ?? "",
    friendly_name: value.friendly_name ?? value.friendlyName ?? "",
  }));

export const action = async ({ request }: ActionFunctionArgs) => {
  const auth = await requireJsonAuth(request);
  if (auth instanceof Response) return auth;

  if (request.method !== "POST") {
    return jsonError("Method not allowed", 405);
  }

  const parsed = await parseJsonBodyOrResponse(request, legacyCallerIdBodySchema);
  if (parsed instanceof Response) return parsed;

  const result = await verifyWorkspaceCallerId(
    getAuthSupabaseClient(auth),
    auth.user.id,
    parsed.workspace_id,
    parsed.phone_number,
    parsed.friendly_name,
  );

  if (!result.ok) {
    return jsonError(result.error, result.status);
  }

  return jsonResponse(
    {
      validationRequest: result.validationRequest,
      numberRequest: result.numberRequest,
    },
    200,
  );
};
