import { createErrorResponse } from "@/lib/errors.server";
import { parseActionRequest } from "@/lib/database.server";
import { purchaseWorkspaceNumber } from "@/lib/platform-workspace-numbers.server";
import {
  getAuthSupabaseClient,
  requireJsonAuth,
} from "@/lib/api-auth.server";
import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import { z } from "zod";
import type { ActionFunctionArgs } from "react-router";

const purchaseBodySchema = z
  .object({
    workspace_id: z.string().uuid(),
    phone_number: z.string().min(1).optional(),
    phoneNumber: z.string().min(1).optional(),
  })
  .refine((value) => Boolean(value.phone_number ?? value.phoneNumber), {
    message: "phone_number is required",
  });

export const action = async ({ request }: ActionFunctionArgs) => {
  const auth = await requireJsonAuth(request);
  if (auth instanceof Response) return auth;

  if (request.method !== "POST") {
    return jsonError("Method not allowed", 405);
  }

  try {
    const raw = await parseActionRequest(request);
    const parsed = purchaseBodySchema.safeParse(raw);
    if (!parsed.success) {
      return jsonError(
        parsed.error.issues.map((issue) => issue.message).join("; "),
        400,
      );
    }

    const workspaceId = parsed.data.workspace_id;
    const phoneNumber = parsed.data.phone_number ?? parsed.data.phoneNumber!;

    const result = await purchaseWorkspaceNumber(
      getAuthSupabaseClient(auth),
      auth.user.id,
      workspaceId,
      phoneNumber,
    );

    if (!result.ok) {
      if ("creditsError" in result && result.creditsError) {
        return jsonResponse({ creditsError: true }, result.status);
      }
      return createErrorResponse(
        new Error(result.error),
        "Failed to register number",
      );
    }

    return jsonResponse(
      {
        newNumber: result.number,
        messagingServiceAttached: result.messagingServiceAttached,
        messagingServiceAttachError: result.messagingServiceAttachError,
        partialSuccess: result.partialSuccess,
      },
      result.status,
    );
  } catch (error) {
    return createErrorResponse(error, "Failed to register number");
  }
};

