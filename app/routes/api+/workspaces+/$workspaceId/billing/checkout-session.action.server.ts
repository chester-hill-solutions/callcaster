import {
  getAuthSupabaseClient,
  requireJsonAuth,
} from "@/lib/api-auth.server";
import { parseJsonBodyOrResponse } from "@/lib/api-parse.server";
import { createBillingCheckoutSession } from "@/lib/platform-billing.server";
import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import { withIdempotency } from "@/lib/platform-idempotency.server";
import { checkoutSessionBodySchema } from "@/lib/schemas/api/platform-billing";
import type { ActionFunctionArgs } from "react-router";

export async function action({ request, params }: ActionFunctionArgs) {
  const auth = await requireJsonAuth(request);
  if (auth instanceof Response) return auth;

  if (request.method !== "POST") {
    return jsonError("Method not allowed", 405);
  }

  const workspaceId = params.workspaceId;
  if (!workspaceId) {
    return jsonError("workspaceId is required", 400);
  }

  const parsed = await parseJsonBodyOrResponse(request, checkoutSessionBodySchema);
  if (parsed instanceof Response) return parsed;

  return withIdempotency(
    request,
    `billing:checkout:${workspaceId}`,
    async () => {
      const result = await createBillingCheckoutSession({
        supabase: getAuthSupabaseClient(auth),
        userId: auth.user.id,
        workspaceId,
        amount: parsed.amount,
        requestUrl: request.url,
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
}
