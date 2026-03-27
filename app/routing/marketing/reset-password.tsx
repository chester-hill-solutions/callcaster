import { Form, useActionData } from "@remix-run/react";
import { Button } from "@/components/ui/button";
import { AuthCard } from "@/components/shared/AuthCard";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";

import { LoaderFunctionArgs, ActionFunctionArgs, json, redirect } from "@remix-run/node";
import { toast } from "sonner";
import { verifyAuth } from "@/lib/supabase.server";
import { useToastOnNewJsonPayload } from "@/hooks/utils/useToastOnNewJsonPayload";
export async function loader({ request }: LoaderFunctionArgs) {
  const { supabaseClient } = await verifyAuth(request);
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) return redirect("/remember");
  return json({});
}

export async function action({ request }: ActionFunctionArgs) {
  const { supabaseClient, headers } = await verifyAuth(request);

  const formData = await request.formData();
  const newPasswordRaw = formData.get("password") as string;
  const confirmNewPasswordRaw = formData.get("confirmPassword") as string;

  const newPassword = newPasswordRaw.trim();
  const confirmNewPassword = confirmNewPasswordRaw.trim();

  if (newPassword !== confirmNewPassword) {
    return json({
      success: null,
      error: { message: "Passwords do not match" },
    });
  }

  const { data: updateUser, error: updateUserError } =
    await supabaseClient.auth.updateUser({ password: newPassword });

  return json({ success: updateUser, error: updateUserError }, { headers });
}

export default function ResetPassword() {
  const actionData = useActionData<typeof action>();

  useToastOnNewJsonPayload(
    actionData,
    actionData?.success != null,
    () => toast.success("Email successfully updated! Redirecting..."),
  );

  return (
    <main className="flex min-h-[calc(100vh-80px)] w-full items-center justify-center px-4 py-16 text-white">
      <AuthCard
        id="login-hero"
        title="Choose New Password"
        description="Set a new password for your account to complete recovery."
      >
        {actionData?.error && (
          <p className="w-full font-Zilla-Slab text-2xl font-bold tracking-[1px] text-brand-primary">
            {actionData.error.message}
          </p>
        )}

        <Form
          method="POST"
          className="flex w-full flex-col gap-4"
          id="password-reset-form"
        >
          <FormField htmlFor="password" label="New Password">
            <Input
              type="password"
              name="password"
              id="password"
              className="border-border bg-white/90 dark:bg-background/80 dark:text-white"
              required
            />
          </FormField>
          <FormField htmlFor="confirmPassword" label="Confirm New Password">
            <Input
              type="password"
              name="confirmPassword"
              id="confirmPassword"
              className="border-border bg-white/90 dark:bg-background/80 dark:text-white"
              required
            />
          </FormField>
          <Button
            className="min-h-[48px] w-full font-Zilla-Slab text-3xl font-bold tracking-[1px]"
            type="submit"
          >
            Reset Password
          </Button>
        </Form>
      </AuthCard>
    </main>
  );
}
