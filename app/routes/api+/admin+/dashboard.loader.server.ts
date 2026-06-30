import { requireSudo } from "@/lib/api-auth.server";
import { jsonResponse } from "@/lib/platform-api.server";
import { getAdminDashboard } from "@/lib/platform-admin.server";
import type { LoaderFunctionArgs } from "react-router";

export async function loader({ request }: LoaderFunctionArgs) {
  const auth = await requireSudo(request);
  if (auth instanceof Response) return auth;

  const dashboard = await getAdminDashboard(auth.null);
  return jsonResponse(dashboard, 200);
}
