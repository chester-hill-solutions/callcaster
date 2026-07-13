import { data as routeData } from "react-router";
import { getAdminDashboard } from "@/lib/platform-admin.server";
import { adminRouteAuth } from "@/lib/admin-route.server";
import { defineLoader } from "@/lib/handler.server";

export const loader = defineLoader({
  auth: adminRouteAuth,
  sideEffects: ["db-read"],
  handler: async ({ auth }) => {
    const { userData } = auth;
    const dashboard = await getAdminDashboard();

    return routeData({
      user: userData,
      ...dashboard,
    });
  },
});
