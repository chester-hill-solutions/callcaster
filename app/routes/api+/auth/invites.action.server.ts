import { requireJsonAuth,
} from "@/lib/api-auth.server";
import { parseJsonBodyOrResponse } from "@/lib/api-parse.server";
import { acceptInvitesBodySchema } from "@/lib/schemas/api/platform-auth";
import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import { acceptInvites, listPendingInvites } from "@/lib/platform-auth.server";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";

export async function loader({ request }: LoaderFunctionArgs) {
  const auth = await requireJsonAuth(request);
  if (auth instanceof Response) return auth;

  const data = await listPendingInvites(    auth.user.id,
  );
  return jsonResponse(data, 200);
}

export async function action({ request }: ActionFunctionArgs) {
  const auth = await requireJsonAuth(request);
  if (auth instanceof Response) return auth;

  if (request.method !== "POST") {
    return jsonError("Method not allowed", 405);
  }

  const parsed = await parseJsonBodyOrResponse(request, acceptInvitesBodySchema);
  if (parsed instanceof Response) return parsed;

  const result = await acceptInvites(    auth.user.id,
    parsed,
  );

  if (!result.ok) {
    return jsonResponse({ errors: result.errors }, result.status);
  }

  return jsonResponse({ accepted: result.accepted }, 200);
}
