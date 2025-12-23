import { json, redirect } from "@remix-run/node";
import { Form, NavLink, useActionData } from "@remix-run/react";
import { useEffect } from "react";
import { toast, Toaster } from "sonner";
<<<<<<< HEAD
import { Button } from "@/components/ui/button";
import { createSupabaseServerClient, verifyAuth } from "@/lib/supabase.server";
=======
import { Button } from "~/components/ui/button";
import { createSupabaseServerClient, verifyAuth } from "~/lib/supabase.server";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
>>>>>>> 43dba5c (Add new components and update TypeScript files for improved functionality)

export const action = async ({ request }: ActionFunctionArgs) => {
  const { supabaseClient, headers } = createSupabaseServerClient(request);
  const requestUrl = new URL(request.url);
  const next = requestUrl.searchParams.get('next');

  const formData = await request.formData();
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email: email,
    password: password,
  });

  if (!error) {
    if (next && next.startsWith('/') && !next.startsWith('/signin')) {
      return redirect(next, {headers});
    }
    return redirect("/workspaces", { headers });
  }
  console.log(error);
  return json({ error: error.message });
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const {supabaseClient, headers} = createSupabaseServerClient(request);
  const { data: { user } } = await supabaseClient.auth.getUser();

  if (user) {
    return redirect("/workspaces", { headers });
  }
  return json({ user }, { headers });
};

export default function SignIn() {
  const actionData = useActionData<typeof action>();

  useEffect(() => {
    if (actionData?.error != null) {
      toast.error(actionData.error, { duration: 4000 });
    }
  }, [actionData]);

  return (
    <main className="mt-16 flex flex-col items-center justify-center text-slate-800 sm:w-full">
      <div
        id="login-hero"
        className="flex flex-col items-center justify-center gap-5 rounded-md bg-brand-secondary px-28 py-8 shadow-lg dark:border-2 dark:border-white dark:bg-transparent dark:shadow-none"
      >
        <h1 className="mb-4 font-Zilla-Slab text-6xl font-bold text-brand-primary dark:text-white">
          Login
        </h1>

        {actionData?.error && (
          <p className="block sm:hidden" style={{ color: "red" }}>
            {actionData.error}
          </p>
        )}

        <Form
          method="POST"
          className="flex w-full flex-col gap-4"
          id="signin-form"
        >
          <label
            htmlFor="email"
            className="flex w-full flex-col font-Zilla-Slab text-2xl font-semibold tracking-[1px] text-black dark:text-white"
          >
            Email
            <input
              autoComplete="email"
              type="text"
              name="email"
              id="email"
              className="w-full rounded-sm border-2 border-black bg-transparent px-4 py-2 text-black dark:border-white dark:text-white"
            />
          </label>

          <label
            htmlFor="password"
            className="flex w-full flex-col font-Zilla-Slab text-2xl font-semibold tracking-[1px] text-black dark:text-white"
          >
            Password
            <input
              autoComplete="current-password"
              type="password"
              name="password"
              id="password"
              className="w-full rounded-sm border-2 border-black bg-transparent px-4 py-2 text-black dark:border-white dark:text-white"
            />
          </label>
        </Form>

        <Button
          className="min-h-[48px] rounded-md bg-brand-primary px-16 py-2 font-Zilla-Slab text-3xl font-bold tracking-[1px] text-white
          transition-colors duration-150 ease-in-out hover:bg-brand-secondary hover:bg-white hover:text-black"
          type="submit"
          form="signin-form"
        >
          Login
        </Button>
        <NavLink
          to={"/signup"}
          className="text-center font-Zilla-Slab text-xl font-bold tracking-[1px] text-black transition-all
          duration-150 hover:text-brand-primary hover:underline dark:text-brand-secondary dark:hover:text-brand-primary"
        >
          Don't Have an Account Yet? Click{" "}
          <span className="text-brand-primary">HERE</span> to Sign-Up!
        </NavLink>
        <NavLink
          to={"/remember"}
          className="font-Zilla-Slab text-xl font-bold tracking-[1px] text-gray-500 hover:text-brand-primary hover:underline dark:text-brand-tertiary"
        >
          I forgot my password
        </NavLink>
      </div>
      <Toaster richColors visibleToasts={1} />
      <img
        alt="background"
        src="/Hero-1.png"
        className="absolute left-0 top-[10px] z-[-1] h-screen overflow-hidden object-cover opacity-10"
      />
    </main>
  );
}
