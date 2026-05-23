import { data as routeData, Form, useActionData, LoaderFunctionArgs, ActionFunctionArgs, redirect } from "react-router";
import { data as routeData } from "react-router";
import type { ActionFunctionArgs } from "react-router";
import { verifyAuth } from "@/lib/supabase.server";

export async function action({ request }: ActionFunctionArgs) {

  const { supabaseClient, headers } = await verifyAuth(request);

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

  const { data: updateUser, error: updateUserError } =
    await supabaseClient.auth.updateUser({ password: newPassword });

  return routeData({ success: updateUser, error: updateUserError }, { headers });
}
