import { data as routeData } from "react-router";
import { updateAdminUser } from "@/lib/platform-admin.server";
import { requireSudoAdmin } from "../../requireSudoAdmin.server";
import type { ActionFunctionArgs } from "react-router";

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { supabaseClient } = await requireSudoAdmin(request);
  const userId = params.userId;

  if (!userId) {
    return routeData({ error: "User ID is required" });
  }

  const formData = await request.formData();
  const actionType = formData.get("_action") as string;

  if (actionType === "update_user") {
    const firstName = formData.get("firstName") as string;
    const lastName = formData.get("lastName") as string;
    const username = formData.get("username") as string;
    const accessLevel = formData.get("accessLevel") as string;

    if (!username) {
      return routeData({ error: "Username is required" });
    }

    const result = await updateAdminUser(supabaseClient, userId, {
      first_name: firstName || null,
      last_name: lastName || null,
      username,
      access_level: accessLevel || "standard",
    });

    if (!result.ok) {
      return routeData({ error: result.error });
    }

    return routeData({ success: "User updated successfully" });
  }

  return routeData({ error: "Invalid action" });
};
