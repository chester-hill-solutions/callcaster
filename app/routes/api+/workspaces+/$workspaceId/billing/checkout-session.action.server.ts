import { parseJsonBodyOrResponse } from "@/lib/api-parse.server";
import { createBillingCheckoutSession } from "@/lib/platform-billing.server";
import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import { withIdempotency } from "@/lib/platform-idempotency.server";
import { checkoutSessionBodySchema } from "@/lib/schemas/api/platform-billing";
import { getDataPlaneRouteContext } from "@/lib/data-plane-route.server";
import { defineAction } from "@/lib/handler.server";
import type { ActionFunctionArgs } from "react-router";

export const action = defineAction({
  auth: ({ params, context }: ActionFunctionArgs) => {
    const workspaceId = params.workspaceId;
    if (!workspaceId) {
      return jsonError("workspaceId is required", 400);
    }
    const { userId } = getDataPlaneRouteContext(context, workspaceId);
    if (!userId) {
      return jsonError("Unauthorized", 401);
    }

    return { userId, workspaceId };
  },
  sideEffects: ["db-write", "external"],
  handler: async ({ request, auth, url }) => {
    if (request.method !== "POST") {
      return jsonError("Method not allowed", 405);
    }

    const parsed = await parseJsonBodyOrResponse(request, checkoutSessionBodySchema);
    if (parsed instanceof Response) return parsed;

    return withIdempotency(
      request,
      `billing:checkout:${auth.workspaceId}`,
      async () => {
        const result = await createBillingCheckoutSession({
          userId: auth.userId,
          workspaceId: auth.workspaceId,
          amount: parsed.amount,
          requestUrl: url.href,
        });

        if (!result.ok) {
          return {
            response: jsonError(result.error, result.status),
            body: { error: result.error },
          };
        }

        const body = {
          checkout_url: result.checkout_url,
          session_id: result.session_id,
          pricing: result.pricing,
        };
        return { response: jsonResponse(body, 200), body };
      },
    );
  },
});
