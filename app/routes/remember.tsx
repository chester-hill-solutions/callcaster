import { Form, useActionData } from "@remix-run/react";
import { json } from "@remix-run/node";
import { useEffect } from "react";
import { toast, Toaster } from "sonner";
<<<<<<< HEAD
import { Button } from "@/components/ui/button";
import { createSupabaseServerClient } from "@/lib/supabase.server";
=======
import { Button } from "~/components/ui/button";
import { createSupabaseServerClient } from "~/lib/supabase.server";
import type { ActionFunctionArgs } from "@remix-run/node";
>>>>>>> 43dba5c (Add new components and update TypeScript files for improved functionality)

export const action = async ({ request }: ActionFunctionArgs) => {
  const { supabaseClient, headers } = createSupabaseServerClient(request);
  const formData = await request.formData();
<<<<<<< HEAD
  const email = formData.get("email");
  if (typeof email !== "string" || !email) {
    return json({ data: null, error: { message: "Email is required" } });
  }
=======
  const email = formData.get("email") as string;
>>>>>>> 43dba5c (Add new components and update TypeScript files for improved functionality)
  const { data, error } = await supabaseClient.auth.resetPasswordForEmail(
    email,
    { redirectTo: `${new URL(request.url).origin}/api/auth/callback` },
  );
  if (error) {
    return json({ data: null, error: error.message }, { headers });
  }
  return json({ data, error: null }, { headers });
};

<<<<<<< HEAD
type ActionData = {
  data: unknown;
  error: { message: string } | null;
} | undefined;

export default function Remember() {
  const actionData = useActionData<ActionData>();
=======
interface RememberData {
  data: Record<string, unknown>;
  error: string | null;
}

export default function Remember() {
  const actionData = useActionData<RememberData>();
>>>>>>> 43dba5c (Add new components and update TypeScript files for improved functionality)

  useEffect(() => {
    if (actionData?.error) {
      toast.error(actionData.error);
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
          id="forgot-password-form"
          method="POST"
          className="mb-auto flex w-full flex-col gap-4"
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
              className="w-full rounded-sm border-2 border-black bg-transparent px-4 py-2 text-black dark:border-white dark:text-white"
            />
          </label>
          <Button
            className="min-h-[48px] rounded-md bg-brand-primary px-16 py-2 font-Zilla-Slab text-xl tracking-[1px] text-white
          transition-colors duration-150 ease-in-out hover:bg-brand-secondary hover:bg-white hover:text-black"
            type="submit"
          >
            Reset
          </Button>
        </Form>
      </div>
      <Toaster richColors />
    </main>
  );
}
