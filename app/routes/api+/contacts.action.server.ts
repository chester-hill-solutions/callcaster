import {
  bulkCreateContacts,
  createContact,
  updateContact,
} from "@/lib/database/contact.server";
import { requireWorkspaceAccess } from "@/lib/database/workspace.server";
import { handleError, parseRequestData } from "@/lib/request-utils.server";
import { findAudienceWorkspaceById } from "@/lib/audience-upload-db.server";
import { searchContactsLoader } from "./contacts.loader.server";
import { data as routeData } from "react-router";
import { getDualAuthUser, requireDualAuth } from "@/lib/api-auth.server";
import { getSession } from "@/lib/auth.server";
import { AppError } from "@/lib/errors.server";

import type { ActionFunctionArgs , LoaderFunctionArgs } from "react-router";

export const loader = async ({ request }: LoaderFunctionArgs) => searchContactsLoader(request);

export const action = async ({ request }: ActionFunctionArgs) => {

  const auth = await requireDualAuth(request);
  if (auth instanceof Response) return auth;
  const { headers } = await getSession(request);
  const user = getDualAuthUser(auth);
  if (!user) {
    return routeData({ error: "Unauthorized" }, { status: 401 });
  }
  const method = request.method;

  try {
    const data = await parseRequestData(request);
    const workspaceId = String(data.workspace_id ?? "");
    if (!workspaceId) {
      return routeData({ error: "Workspace ID is required" }, { status: 400 });
    }
    await requireWorkspaceAccess({ user, workspaceId });

    switch (method) {
      case 'PATCH': {
        const updatedContact = await updateContact(workspaceId, data);
        return routeData({ data: updatedContact }, { status: 200 });
      }

      case 'POST': {
        const audienceId = data.audience_id != null ? Number(data.audience_id) : undefined;
        if (audienceId != null && !isNaN(audienceId)) {
          const audienceWorkspaceId = await findAudienceWorkspaceById(audienceId);
          if (audienceWorkspaceId !== workspaceId) {
            return routeData({ error: "Audience not found" }, { status: 404 });
          }
        }
        if (Array.isArray(data.contacts)) {
            const bulkResult = await bulkCreateContacts(
              data.contacts,
              workspaceId,
              data.audience_id,
              user.id,
            );
          return routeData(bulkResult);
        } else {
          const newContact = await createContact(data, data.audience_id, user.id, {
            assignDefaultAudienceIfMissing: data.assign_default_sms_audience === "true",
          });
          return routeData(newContact);
        }
      }

      default:
        return routeData({ error: 'Unsupported request method' }, { status: 400 });
    }
  } catch (err) {
    if (err instanceof Error && err.message === 'Unsupported content type') {
      return routeData({ error: 'Unsupported content type' }, { status: 415 });
    }
    if (err instanceof AppError) {
      return routeData({ error: err.message }, { status: err.statusCode });
    }
    return handleError(err instanceof Error ? err : new Error(String(err)), 'An unexpected error occurred');
  }
}
