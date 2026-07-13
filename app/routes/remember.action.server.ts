import { auth } from "@/server/auth-instance";
import { data as routeData } from "react-router";
import { defineAction } from "@/lib/handler.server";

export const action = defineAction({
  sideEffects: ["email"],
  handler: async ({ request, url }) => {
    const formData = await request.formData();
    const email = formData.get("email");
    if (typeof email !== "string" || !email) {
      return routeData({ data: null, error: { message: "Email is required" } });
    }
    try {
      await auth.api.requestPasswordReset({
        body: { email, redirectTo: `${url.origin}/api/auth/callback` },
        headers: request.headers,
      });
      return routeData({ data: { success: true }, error: null });
    } catch (error: any) {
      return routeData({ data: null, error: { message: error?.message || "Failed to send reset email" } });
    }
  },
});
