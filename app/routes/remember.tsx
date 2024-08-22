import { Form, json, useActionData, useOutletContext } from "@remix-run/react";
import { useEffect } from "react";
import { toast, Toaster } from "sonner";
import { Button } from "~/components/ui/button";
import { createSupabaseServerClient } from "~/lib/supabase.server";

export const action = async ({ request }: { request: Request }) => {
  const { supabaseClient, headers } = createSupabaseServerClient(request);
  const formData = await request.formData();
  const email = formData.get("email");
  const { data, error } = await supabaseClient.auth.resetPasswordForEmail(
    email,
    { redirectTo: `${new URL(request.url).origin}/api/auth/callback` },
  );
  if (error) {
    return json({ data: null, error });
  }
  return json({ data, error: null });
};

export default function Remember() {
  const actionData = useActionData();

  useEffect(() => {
    if (actionData?.data) {
      toast.success("Reset email sent");
    } else if (actionData?.error) {
      toast.error(actionData.error.message);
    }
  }, [actionData]);
  return (
    <main className="mt-16 flex flex-col items-center justify-center text-slate-800 sm:w-full">
      <div
        id="login-hero"
        className="flex flex-col items-center justify-center gap-5 rounded-md bg-brand-secondary px-28 py-8 shadow-lg dark:border-2 dark:border-white dark:bg-transparent dark:shadow-none"
      >
        <h1 className="mb-4 font-Zilla-Slab text-3xl font-bold text-brand-primary dark:text-white">
          Reset Password
        </h1>
        <Form
          method="POST"
          className="flex w-full flex-col gap-4"
          id="remember-form"
        >
          <label
            htmlFor="email"
            className="flex w-full flex-col font-Zilla-Slab text-xl font-semibold tracking-[1px] text-black dark:text-white"
          >
            Email
            <input
              type="text"
              name="email"
              id="email"
              className="w-full rounded-sm border-2 border-white bg-transparent px-4 py-2"
            />
          </label>

          <Button
            className="min-h-[48px] rounded-md bg-brand-primary px-16 py-2 font-Zilla-Slab text-xl tracking-[1px] text-white
          transition-colors duration-150 ease-in-out hover:bg-brand-secondary hover:bg-white hover:text-black"
            type="submit"
          >
            Send Password Reset
          </Button>
        </Form>
      </div>
      <Toaster richColors />
    </main>
  );
}
