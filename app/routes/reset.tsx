import {
  Form,
  json,
  redirect,
  useActionData,
  useNavigate,
} from "@remix-run/react";
import { useEffect } from "react";
import { toast, Toaster } from "sonner";
import { Button } from "~/components/ui/button";
import { verifyAuth } from "~/lib/supabase.server";
import { LoaderFunctionArgs } from "@remix-run/node";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { supabaseClient, headers } = await verifyAuth(request);
  const {
    data: { session },
  } = await supabaseClient.auth.getSession();
  if (!session) {
    redirect("/remember");
  }
  return json({}, {headers});
};

export const action = async ({ request }: { request: Request }) => {
  const { supabaseClient, user } = await verifyAuth(request);

  const formData = await request.formData();
  const password = formData.get("password");
  const confirmPassword = formData.get("confirmPassword");
  if (password !== confirmPassword)
    return { error: { message: "Passwords don't match" }, data: null };
  const { data, error } = await supabaseClient.auth.updateUser({ password: password as string });
  if (error) {
    return json({ data: null, error });
  }
  return json({ data, error: null });
};

export default function Reset() {
  const actionData = useActionData<typeof action>();
  const navigate = useNavigate();

  useEffect(() => {
    if (actionData && actionData?.data) {
      toast.success("New password set!");
      const redirectTimer = setTimeout(() => {
        navigate("/workspaces");
      }, 2000);
      return () => clearTimeout(redirectTimer);
    } else if (actionData?.error) {
      toast.error(actionData.error.message);
    }
  }, [actionData, navigate]);
  return (
    <main className="mt-16 flex flex-col items-center justify-center text-slate-800 sm:w-full">
      <div
        id="login-hero"
        className="flex flex-col items-center justify-center gap-5 rounded-md bg-brand-secondary px-28 py-8 shadow-lg dark:border-2 dark:border-white dark:bg-transparent dark:shadow-none"
      >
        <h1 className="mb-4 font-Zilla-Slab text-3xl font-bold text-brand-primary dark:text-white">
          Set New Password
        </h1>
        <Form
          method="POST"
          className="flex w-full flex-col gap-4"
          id="reset-form"
        >
          <label
            htmlFor="password"
            className="flex w-full flex-col font-Zilla-Slab text-xl font-semibold tracking-[1px] text-black dark:text-white"
          >
            Password
            <input
              type="password"
              name="password"
              id="password"
              className="w-full rounded-sm border-2 border-white bg-transparent px-4 py-2"
            />
          </label>
          <label
            htmlFor="confirmPassword"
            className="flex w-full flex-col font-Zilla-Slab text-xl font-semibold tracking-[1px] text-black dark:text-white"
          >
            Confirm
            <input
              type="password"
              name="confirmPassword"
              id="confirmPassword"
              className="w-full rounded-sm border-2 border-white bg-transparent px-4 py-2"
            />
          </label>

          <Button
            className="min-h-[48px] rounded-md bg-brand-primary px-16 py-2 font-Zilla-Slab text-xl tracking-[1px] text-white
          transition-colors duration-150 ease-in-out hover:bg-brand-secondary hover:bg-white hover:text-black"
            type="submit"
          >
            Save Password
          </Button>
        </Form>
      </div>
      <Toaster richColors />
    </main>
  );
}
