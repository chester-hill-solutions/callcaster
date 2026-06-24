import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import {
  getConversationMessagesApi,
  resolveDataPlaneAuth,
} from "@/lib/platform-data.server";
import type { LoaderFunctionArgs } from "react-router";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const workspaceId = params.workspaceId;
  const contactNumber = params.contactNumber;
  if (!workspaceId || !contactNumber) {
    return jsonError("workspaceId and contactNumber are required", 400);
  }

  const auth = await resolveDataPlaneAuth(request, workspaceId);
  if (auth instanceof Response) return auth;

  const url = new URL(request.url);
  const result = await getConversationMessagesApi(
    auth.supabase,
    workspaceId,
    decodeURIComponent(contactNumber),
    url.searchParams,
  );

  return jsonResponse(
    {
      contact_number: result.contact_number,
      messages: result.messages,
      has_more: result.has_more,
    },
    200,
  );
}
