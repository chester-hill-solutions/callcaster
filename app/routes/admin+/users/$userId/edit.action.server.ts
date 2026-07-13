import { data as routeData } from "react-router";
import { updateAdminUser } from "@/lib/platform-admin.server";
import { adminRouteAuth } from "@/lib/admin-route.server";
import { defineAction } from "@/lib/handler.server";

export const action = defineAction({
  auth: adminRouteAuth,
  sideEffects: ["db-write"],
  handler: async ({ request, params }) => {
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

      const result = await updateAdminUser(userId, {
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
  },
});
