import { getSession } from "@/lib/auth.server";
import { data as routeData, redirect } from "react-router";
import { defineLoader } from "@/lib/handler.server";

export const loader = defineLoader({
  sideEffects: ["db-read"],
  handler: async ({ request }) => {
    const { user, headers } = await getSession(request);

    if (user) {
      return redirect("/workspaces", { headers });
    }
    return routeData({ user: null }, { headers });
  },
});
