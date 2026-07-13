import { requireJsonAuth,
} from "@/lib/api-auth.server";
import { parseJsonBodyOrResponse } from "@/lib/api-parse.server";
import {
  acceptInvitesBodySchema,
  updateMeBodySchema,
} from "@/lib/schemas/api/platform-auth";
import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import {
  acceptInvites,
  getMeProfile,
  listPendingInvites,
  updateMeProfile,
} from "@/lib/platform-auth.server";
import { defineAction, defineLoader } from "@/lib/handler.server";

export const loader = defineLoader({
  auth: ({ request }) => requireJsonAuth(request),
  sideEffects: ["db-read"],
  handler: async ({ auth }) => {
    const profile = await getMeProfile(    auth.user.id,
    );
    return jsonResponse(profile, 200);
  },
});

export const action = defineAction({
  auth: ({ request }) => requireJsonAuth(request),
  sideEffects: ["db-write"],
  handler: async ({ request }) => {
    if (request.method === "PATCH") {
      const parsed = await parseJsonBodyOrResponse(request, updateMeBodySchema);
      if (parsed instanceof Response) return parsed;

      const result = await updateMeProfile(request, parsed);
      if (!result.ok) {
        return jsonError(result.error, result.status);
      }
      return jsonResponse({ user: result.data }, 200);
    }

    return jsonError("Method not allowed", 405);
  },
});
