import { requireJsonAuth } from "@/lib/api-auth.server";
import { jsonError, methodNotAllowed } from "@/lib/platform-api.server";
import type { ActionFunctionArgs } from "react-router";

export async function action({ request }: ActionFunctionArgs) {
  const auth = await requireJsonAuth(request);
  if (auth instanceof Response) return auth;

  if (request.method !== "GET") {
    return methodNotAllowed(["GET"]);
  }

  return jsonError("Use GET on this endpoint for billing balance and transactions.", 405);
}
