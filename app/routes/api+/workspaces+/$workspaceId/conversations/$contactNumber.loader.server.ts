import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import { fetchLatestMessageForPhone } from "@/lib/message-db.server";
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

  const decodedContactNumber = decodeURIComponent(contactNumber);
  const url = new URL(request.url);

  if (url.searchParams.get("latest") === "1") {
    try {
      const latestMessage = await fetchLatestMessageForPhone(
        workspaceId,
        decodedContactNumber,
      );
      return jsonResponse({ latest_message: latestMessage }, 200);
    } catch (error) {
      return jsonError(
        error instanceof Error ? error.message : "Failed to load latest message",
        500,
      );
    }
  }

  const result = await getConversationMessagesApi(
    auth.supabase,
    workspaceId,
    decodedContactNumber,
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
