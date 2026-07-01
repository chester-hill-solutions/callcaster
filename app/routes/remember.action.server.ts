import { getSession } from "@/lib/auth.server";
import { auth } from "@/server/auth-instance";
import { data as routeData } from "react-router";
import type { ActionFunctionArgs } from "react-router";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { headers } = await getSession(request);
  const formData = await request.formData();
  const email = formData.get("email");
  if (typeof email !== "string" || !email) {
    return routeData({ data: null, error: { message: "Email is required" } });
  }
  try {
    await (auth.api as any).resetPassword({
      body: { email, redirectTo: `${new URL(request.url).origin}/api/auth/callback` },
    });
    return routeData({ data: { success: true }, error: null }, { headers });
  } catch (error: any) {
    return routeData({ data: null, error: { message: error?.message || "Failed to send reset email" } }, { headers });
  }
};
