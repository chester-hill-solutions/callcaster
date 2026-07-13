import { requireJsonAuth,
} from "@/lib/api-auth.server";
import { parseJsonBodyOrResponse } from "@/lib/api-parse.server";
import { acceptInvitesBodySchema } from "@/lib/schemas/api/platform-auth";
import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import { acceptInvites, listPendingInvites } from "@/lib/platform-auth.server";
import { defineAction, defineLoader } from "@/lib/handler.server";

export const loader = defineLoader({
  auth: ({ request }) => requireJsonAuth(request),
  sideEffects: ["db-read"],
  handler: async ({ auth }) => {
    const data = await listPendingInvites(auth.user.id);
    return jsonResponse(data, 200);
  },
});

export const action = defineAction({
  auth: ({ request }) => requireJsonAuth(request),
  sideEffects: ["db-write"],
  handler: async ({ request, auth }) => {
    if (request.method !== "POST") {
      return jsonError("Method not allowed", 405);
    }

    const parsed = await parseJsonBodyOrResponse(request, acceptInvitesBodySchema);
    if (parsed instanceof Response) return parsed;

    const result = await acceptInvites(auth.user.id, parsed);

    if (!result.ok) {
      return jsonResponse({ errors: result.errors }, result.status);
    }

    return jsonResponse({ accepted: result.accepted }, 200);
  },
});
