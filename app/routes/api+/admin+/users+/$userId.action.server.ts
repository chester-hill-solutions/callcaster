import { requireSudo } from "@/lib/api-auth.server";
import { parseJsonBodyOrResponse } from "@/lib/api-parse.server";
import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import { getAdminUser, updateAdminUser } from "@/lib/platform-admin.server";
import { defineAction, defineLoader } from "@/lib/handler.server";
import { z } from "zod";

import { ACCESS_LEVELS } from "../../../../../shared/access-levels";

const updateUserSchema = z.object({
  first_name: z.string().nullable().optional(),
  last_name: z.string().nullable().optional(),
  username: z.string().min(1),
  // Constrain to the levels the admin console offers. An omitted level stays
  // omitted: the write is a partial update, so a rename no longer demotes.
  access_level: z.enum(ACCESS_LEVELS).optional(),
});

async function requireSudoWithUserId({
  request,
  params,
}: {
  request: Request;
  params: Record<string, string | undefined>;
}) {
  const auth = await requireSudo(request);
  if (auth instanceof Response) return auth;

  const userId = params.userId;
  if (!userId) {
    return jsonError("userId is required", 400);
  }

  return { ...auth, userId };
}

export const loader = defineLoader({
  auth: requireSudoWithUserId,
  sideEffects: ["db-read"],
  handler: async ({ auth }) => {
    const result = await getAdminUser(auth.userId);
    if (!result.ok) {
      return jsonError(result.error, result.status);
    }

    return jsonResponse({ user: result.user }, 200);
  },
});

export const action = defineAction({
  auth: requireSudoWithUserId,
  sideEffects: ["db-write"],
  handler: async ({ request, auth }) => {
    if (request.method !== "PATCH") {
      return jsonError("Method not allowed", 405);
    }

    const parsed = await parseJsonBodyOrResponse(request, updateUserSchema);
    if (parsed instanceof Response) return parsed;

    const result = await updateAdminUser(auth.userId, parsed);
    if (!result.ok) {
      return jsonError(result.error, 500);
    }

    return jsonResponse({
      success: true,
      message: "User updated successfully",
    });
  },
});
