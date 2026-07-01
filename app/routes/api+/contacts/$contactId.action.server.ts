import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import {
  authForContact,
  deleteContactApi,
  getContactDetailApi,
} from "@/lib/platform-data.server";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const contactId = params.contactId;
  if (!contactId) {
    return jsonError("contactId is required", 400);
  }

  const auth = await authForContact(request, contactId);
  if (auth instanceof Response) return auth;

  const result = await getContactDetailApi(
    contactId,
    auth.workspaceId,
  );
  if (!result.ok) {
    return jsonError(result.error, result.status);
  }

  return jsonResponse({ contact: result.contact }, 200);
}

export async function action({ request, params }: ActionFunctionArgs) {
  const contactId = params.contactId;
  if (!contactId) {
    return jsonError("contactId is required", 400);
  }

  if (request.method !== "DELETE") {
    return jsonError("Method not allowed", 405);
  }

  const auth = await authForContact(request, contactId);
  if (auth instanceof Response) return auth;

  const result = await deleteContactApi(
    contactId,
    auth.workspaceId,
  );
  if (!result.ok) {
    return jsonError(result.error, result.status);
  }

  return jsonResponse({ success: true, contact_id: result.contact_id }, 200);
}
