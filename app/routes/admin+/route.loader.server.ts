import { data as routeData } from "react-router";
import { getAdminDashboard } from "@/lib/platform-admin.server";
import { getAdminRouteContext } from "@/lib/admin-route.server";
import type { LoaderFunctionArgs } from "react-router";

export const loader = async ({ context }: LoaderFunctionArgs) => {
  const { userData } = getAdminRouteContext(context);
  const dashboard = await getAdminDashboard();

  return routeData({
    user: userData,
    ...dashboard,
  });
};
