import { data as routeData } from "react-router";
import { getAdminDashboard } from "@/lib/platform-admin.server";
import { requireSudoAdmin } from "./requireSudoAdmin.server";
import type { LoaderFunctionArgs } from "react-router";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { userData } = await requireSudoAdmin(request);
  const dashboard = await getAdminDashboard();

  return routeData({
    user: userData,
    ...dashboard,
  });
};
