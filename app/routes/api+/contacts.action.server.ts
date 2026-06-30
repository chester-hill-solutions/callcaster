import { bulkCreateContacts, createContact, handleError, parseRequestData, updateContact } from "@/lib/database.server";
import { searchContactsLoader } from "./contacts.loader.server";
import { data as routeData } from "react-router";
import { getDualAuthUser, requireDualAuth } from "@/lib/api-auth.server";
import { getSession } from "@/lib/auth.server";

import type { ActionFunctionArgs } from "react-router";
import type { LoaderFunctionArgs } from "react-router";

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

    switch (method) {
      case 'PATCH': {
        const updatedContact = await updateContact(data.workspace_id, data);
        return routeData({ data: updatedContact }, { status: 200 });
      }

      case 'POST':
        if (Array.isArray(data.contacts)) {
            const bulkResult = await bulkCreateContacts(
              data.contacts,
              data.workspace_id,
              data.audience_id,
              user.id,
            );
          return routeData(bulkResult);
        } else {
          const newContact = await createContact(data, data.audience_id, user.id);
          return routeData(newContact);
        }

      default:
        return routeData({ error: 'Unsupported request method' }, { status: 400 });
    }
  } catch (err) {
    if (err instanceof Error && err.message === 'Unsupported content type') {
      return routeData({ error: 'Unsupported content type' }, { status: 415 });
    }
    return handleError(err instanceof Error ? err : new Error(String(err)), 'An unexpected error occurred');
  }
}
