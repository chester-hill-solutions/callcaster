import { Form, Link, useActionData } from "@remix-run/react";
import { Button } from "~/components/ui/button";

import { LoaderFunctionArgs, ActionFunctionArgs, json } from "@remix-run/node";
import { Toaster, toast } from "sonner";
import { getSupabaseServerClientWithSession } from "~/lib/supabase.server";
import { useEffect } from "react";
export async function loader({ request }: LoaderFunctionArgs) {
  return {};
}

export async function action({ request }: ActionFunctionArgs) {
  const { supabaseClient, serverSession, headers } =
    getSupabaseServerClientWithSession(request);

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

const fieldLabelStyles =
  "flex w-full flex-col font-Zilla-Slab text-2xl font-bold tracking-[1px] text-black dark:text-white";
const fieldInputStyles =
  "w-full rounded-sm border-2 border-black bg-transparent px-4 py-2 text-black dark:border-white dark:text-white";

export default function ResetPassword() {
  const actionData = useActionData<typeof action>();

  useEffect(() => {
    if (actionData?.success != null) {
      toast.success("Email successfully updated! Redirecting...");
    }
  }, [actionData]);

  return (
    <main className="flex h-[calc(100vh-80px)] w-full flex-col items-center justify-center py-16 text-white">
      <div
        id="login-hero"
        className="flex flex-col items-center justify-center gap-5 rounded-md bg-brand-secondary px-24 py-16 shadow-lg dark:border-2 dark:border-white dark:bg-transparent dark:shadow-none"
      >
        <h1 className="mb-4 font-Zilla-Slab text-6xl font-bold text-brand-primary dark:text-white">
          Choose New Password
        </h1>

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
          <label htmlFor="password" className={fieldLabelStyles}>
            {/* {passwordError && (
              <p className="font-Zilla-Slab font-bold text-brand-primary">
                {passwordError}
              </p>
            )} */}
            New Password
            <input
              type="password"
              name="password"
              id="password"
              className={fieldInputStyles}
              required
            />
          </label>
          <label htmlFor="confirmPassword" className={fieldLabelStyles}>
            Confirm New Password
            <input
              type="password"
              name="confirmPassword"
              id="confirmPassword"
              className={fieldInputStyles}
              required
            />
          </label>
          <Button
            className="min-h-[48px] rounded-md bg-brand-primary px-8 py-2 font-Zilla-Slab text-3xl font-bold tracking-[1px] text-white
          transition-colors duration-150 ease-in-out hover:bg-white hover:text-black"
            type="submit"
          >
            Reset Password
          </Button>
        </Form>
      </div>
      <Toaster richColors visibleToasts={1} />
    </main>
  );
}
