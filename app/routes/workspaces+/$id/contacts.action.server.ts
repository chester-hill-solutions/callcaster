import { data as routeData } from "react-router";
import { deleteContactApi } from "@/lib/platform-data.server";
import { defineAction } from "@/lib/handler.server";
import { MemberRole } from "@/lib/member-role";
import { hasMinRole, workspaceRouteAuth } from "@/lib/workspace-route.server";

export const action = defineAction({
  auth: workspaceRouteAuth,
  sideEffects: ["db-write"],
  handler: async ({ request, auth }) => {
    if (!hasMinRole(auth.userRole, MemberRole.Member)) {
      return routeData(
        { error: "You don't have permission to delete contacts." },
        { headers: auth.headers, status: 403 },
      );
    }

    const formData = await request.formData();
    if (formData.get("intent") !== "delete_contact") {
      return routeData({ error: "Unsupported contact action." }, { status: 400 });
    }

    const contactId = String(formData.get("contact_id") ?? "");
    if (!/^\d+$/.test(contactId) || !Number.isSafeInteger(Number(contactId))) {
      return routeData({ error: "A valid contact ID is required." }, { status: 400 });
    }

    const result = await deleteContactApi(contactId, auth.workspaceId);
    if (!result.ok) {
      return routeData({ error: result.error }, { headers: auth.headers, status: result.status });
    }

    return routeData({ success: true, contact_id: result.contact_id }, { headers: auth.headers });
  },
});
