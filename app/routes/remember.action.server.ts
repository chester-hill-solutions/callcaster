import { getSession } from "@/lib/auth.server";
import { data as routeData } from "react-router";
import type { ActionFunctionArgs } from "react-router";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { headers } = await getSession(request);
  const formData = await request.formData();
  const email = formData.get("email");
  if (typeof email !== "string" || !email) {
    return routeData({ data: null, error: { message: "Email is required" } });
  }
  const { data, error } = await request.resetPasswordForEmail(email, {
    redirectTo: `${new URL(request.url).origin}/api/auth/callback`,
  });
  if (error) {
    return routeData({ data: null, error: error.message }, { headers });
  }
  return routeData({ data, error: null }, { headers });
};
