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
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";

export async function loader({ request }: LoaderFunctionArgs) {
  const auth = await requireJsonAuth(request);
  if (auth instanceof Response) return auth;

  const profile = await getMeProfile(    auth.user.id,
  );
  return jsonResponse(profile, 200);
}

export async function action({ request }: ActionFunctionArgs) {
  const auth = await requireJsonAuth(request);
  if (auth instanceof Response) return auth;
  if (request.method === "PATCH") {
    const parsed = await parseJsonBodyOrResponse(request, updateMeBodySchema);
    if (parsed instanceof Response) return parsed;

    const result = await updateMeProfile(client, parsed);
    if (!result.ok) {
      return jsonError(result.error, result.status);
    }
    return jsonResponse({ user: result.data }, 200);
  }

  return jsonError("Method not allowed", 405);
}
