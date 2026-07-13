import { getSession } from "@/lib/auth.server";
import { isSignupOpen } from "@/lib/env.server";
import { data as routeData, redirect } from "react-router";
import { defineLoader } from "@/lib/handler.server";

export const loader = defineLoader({
  sideEffects: ["db-read"],
  handler: async ({ request }) => {
    const { headers, user } = await getSession(request);

    if (user) {
      return redirect("/workspaces", { headers });
    }
    return routeData({ signupOpen: isSignupOpen() }, { headers });
  },
});
