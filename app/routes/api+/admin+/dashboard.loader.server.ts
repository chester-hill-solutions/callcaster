import { requireSudo } from "@/lib/api-auth.server";
import { jsonResponse } from "@/lib/platform-api.server";
import { getAdminDashboard } from "@/lib/platform-admin.server";
import { defineLoader } from "@/lib/handler.server";

export const loader = defineLoader({
  auth: ({ request }) => requireSudo(request),
  sideEffects: ["db-read"],
  handler: async () => {
    const dashboard = await getAdminDashboard();
    return jsonResponse(dashboard, 200);
  },
});
