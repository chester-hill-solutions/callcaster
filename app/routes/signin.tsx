import { json, redirect } from "@remix-run/node";
import { Form, Link, useActionData } from "@remix-run/react";
import { Button } from "~/components/ui/button";
import { createSupabaseServerClient } from "~/lib/supabase.server";
import { setWorkspace } from "~/lib/utils";

export const action = async ({ request }: { request: Request }) => {
  const { supabaseClient, headers } = createSupabaseServerClient(request);

  const formData = await request.formData();
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const {
    data: { user },
    error,
  } = await supabaseClient.auth.signInWithPassword({
    email,
    password,
  });
  
  if (error) {
    console.log("Error during sign-in:", error);
    return json({ error: error.message });
  }

  console.log("User ID after sign-in:", user?.id);
  return redirect("/dashboard", { headers });

};

export const loader = async ({ request }: { request: Request }) => {
  const { supabaseClient, headers } = createSupabaseServerClient(request);
  const { data } = await supabaseClient.auth.getSession();
  console.log("Session data:", data);
  return json({ data }, { headers });
};

export default function SignIn() {
  const actionData = useActionData();
  return (
    <main className="flex h-screen w-full flex-col items-center py-8 text-white">
      <h1 className="text-5xl font-bold">Sign In</h1>
      {actionData?.error && <p style={{ color: "red" }}>{actionData.error}</p>}
      <Form
        method="post"
        className="mt-8 flex flex-col gap-4 rounded-md bg-gray-50 p-6 text-lg text-black shadow-md"
      >
        <label htmlFor="email" className="flex flex-col gap-1 text-gray-600">
          Email
          <input
            type="email"
            id="email"
            name="email"
            required
            className="rounded-md bg-gray-200 px-2 py-1"
          />
        </label>

        <label htmlFor="password" className="flex flex-col gap-1 text-gray-600">
          Password
          <input
            type="password"
            id="password"
            name="password"
            required
            className="rounded-md bg-gray-200 px-2 py-1"
          />
        </label>

        <div className="flex items-center justify-center gap-4">
          <Button type="submit" variant={"outline"}>
            Sign In
          </Button>
          <Link
            to="/"
            className="rounded-md bg-gray-400 px-4 py-2 text-xl font-bold text-slate-800
                       transition duration-150 ease-in-out hover:bg-gray-800 hover:text-slate-200"
          >
            Cancel
          </Link>
        </div>
      </Form>
    </main>
  );
}
