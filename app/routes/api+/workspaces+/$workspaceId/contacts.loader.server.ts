import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import { findContactsByPhone } from "@/lib/database/contact.server";
import {
  listWorkspaceContactsApi,
  resolveDataPlaneAuth,
} from "@/lib/platform-data.server";
import type { LoaderFunctionArgs } from "react-router";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const workspaceId = params.workspaceId;
  if (!workspaceId) {
    return jsonError("workspaceId is required", 400);
  }

  const auth = await resolveDataPlaneAuth(request, workspaceId);
  if (auth instanceof Response) return auth;

  const url = new URL(request.url);
  const phone = url.searchParams.get("phone");
  if (phone) {
    try {
      const contacts = await findContactsByPhone(workspaceId, phone);
      return jsonResponse({ contacts }, 200);
    } catch (error) {
      return jsonError(
        error instanceof Error ? error.message : "Failed to search contacts by phone",
        500,
      );
    }
  }

  const result = await listWorkspaceContactsApi(
    auth.client,
    workspaceId,
    url.searchParams,
  );
  if (!result.ok) {
    return jsonError(result.error, result.status);
  }

  return jsonResponse(
    {
      contacts: result.contacts,
      pagination: result.pagination,
      search_query: result.search_query,
    },
    200,
  );
}
