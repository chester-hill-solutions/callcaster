import { requireDataPlaneCapability } from "@/lib/capability-guard.server";
import { jsonError, jsonResponse } from "@/lib/platform-api.server";
import { defineAction, defineLoader } from "@/lib/handler.server";
import {
  authForContact,
  deleteContactApi,
  getContactDetailApi,
} from "@/lib/platform-data.server";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";

export const loader = defineLoader({
  auth: async ({ request, params }: LoaderFunctionArgs) => {
    const contactId = params.contactId;
    if (!contactId) {
      return jsonError("contactId is required", 400);
    }

    const auth = await authForContact(request, contactId);
    if (auth instanceof Response) return auth;

    const capability = await requireDataPlaneCapability(auth, "campaigns.read");
    if (capability instanceof Response) return capability;

    return { ...auth, contactId };
  },
  sideEffects: ["db-read"],
  handler: async ({ auth }) => {
    const result = await getContactDetailApi(
      auth.contactId,
      auth.workspaceId,
    );
    if (!result.ok) {
      return jsonError(result.error, result.status);
    }

    return jsonResponse({ contact: result.contact }, 200);
  },
});

export const action = defineAction({
  auth: async ({ request, params }: ActionFunctionArgs) => {
    const contactId = params.contactId;
    if (!contactId) {
      return jsonError("contactId is required", 400);
    }

    if (request.method !== "DELETE") {
      return jsonError("Method not allowed", 405);
    }

    // Destructive mutation: require at least `member`, blocking the `caller` role.
    const auth = await authForContact(request, contactId, "member");
    if (auth instanceof Response) return auth;

    const capability = await requireDataPlaneCapability(auth, "campaigns.write");
    if (capability instanceof Response) return capability;

    return { ...auth, contactId };
  },
  sideEffects: ["db-write"],
  handler: async ({ auth }) => {
    const result = await deleteContactApi(
      auth.contactId,
      auth.workspaceId,
    );
    if (!result.ok) {
      return jsonError(result.error, result.status);
    }

    return jsonResponse({ success: true, contact_id: result.contact_id }, 200);
  },
});
