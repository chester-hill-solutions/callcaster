import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import { signOutUser } from "@/lib/platform-auth.server";
import type { ActionFunctionArgs } from "react-router";

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return jsonError("Method not allowed", 405);
  }

  await signOutUser(request);
  return jsonResponse({ success: true }, 200);
}
