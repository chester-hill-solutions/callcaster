import { data as routeData } from "react-router";
import { verifyAuth } from "@/lib/auth.server";
import { auth } from "@/server/auth-instance";
import type { ActionFunctionArgs } from "react-router";

export async function action({ request }: ActionFunctionArgs) {

  const { headers } = await verifyAuth(request);

  const formData = await request.formData();
  const newPasswordRaw = formData.get("password") as string;
  const confirmNewPasswordRaw = formData.get("confirmPassword") as string;

  const newPassword = newPasswordRaw.trim();
  const confirmNewPassword = confirmNewPasswordRaw.trim();

  if (newPassword !== confirmNewPassword) {
    return routeData({
      success: null,
      error: { message: "Passwords do not match" },
    });
  }

  try {
    const result = await (auth.api as any).updateUser({
      body: { password: newPassword },
      headers: request.headers,
    });
    return routeData({ success: result, error: null }, { headers });
  } catch (error: any) {
    return routeData({ success: null, error: { message: error?.message || "Update failed" } }, { headers });
  }
}
