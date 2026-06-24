import {
  getAuthSupabaseClient,
  requireJsonAuth,
} from "@/lib/api-auth.server";
import { getWorkspaceBilling } from "@/lib/platform-billing.server";
import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import type { LoaderFunctionArgs } from "react-router";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const auth = await requireJsonAuth(request);
  if (auth instanceof Response) return auth;

  const workspaceId = params.workspaceId;
  if (!workspaceId) {
    return jsonError("workspaceId is required", 400);
  }

  const result = await getWorkspaceBilling(
    getAuthSupabaseClient(auth),
    auth.user.id,
    workspaceId,
  );

  if (!result.ok) {
    return jsonError(result.error, result.status);
  }

  return jsonResponse(
    {
      balance: result.balance,
      transactions: result.transactions,
      pricing: result.pricing,
    },
    200,
  );
}
