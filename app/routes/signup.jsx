import { json, useActionData, redirect, Link } from "@remix-run/react";
import { createSupabaseServerClient } from "~/lib/supabase.server";

export const action = async ({ request }) => {
  const formData = await request.formData();
  const email = formData.get("email");
  const password = formData.get("password");
  const { supabaseClient: supabase, headers } =
    createSupabaseServerClient(request);
  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) {
    return json({ error: error.message }, { headers });
  }

  if (data.user) {
    return redirect("/signin");
  }
};

export default function SignUp() {
  const actionData = useActionData();

  return (
    <main className="flex h-screen w-full flex-col items-center py-8 text-white">
      <h1 className="text-5xl font-bold">Sign Up</h1>
      {actionData?.error && <p style={{ color: "red" }}>{actionData.error}</p>}
      <form
        method="post"
        className="mt-8 flex flex-col gap-4 rounded-md bg-gray-900 p-6 text-lg text-white shadow-md"
      >
        <label htmlFor="email" className="flex flex-col gap-1 text-gray-400">
          Email
          <input
            type="email"
            id="email"
            name="email"
            required
            className="rounded-md border-2 border-gray-200 bg-transparent px-2 py-1
                       transition duration-150 focus:bg-indigo-500"
          />
        </label>

        <label htmlFor="password" className="flex flex-col gap-1 text-gray-400">
          Password
          <input
            type="password"
            id="password"
            name="password"
            required
            className="rounded-md border-2 border-gray-200 bg-transparent px-2 py-1 
                       transition duration-150 focus:bg-indigo-500"
          />
        </label>

        <div className="flex items-center justify-center gap-4">
          <button
            type="submit"
            className="rounded-md bg-violet-400 px-4 py-2 text-xl font-bold text-white 
                        transition duration-150 ease-in-out hover:bg-violet-900"
          >
            Sign Up
          </button>
          <Link
            to="/"
            className="rounded-md bg-gray-400 px-4 py-2 text-xl font-bold text-slate-800
                       transition duration-150 ease-in-out hover:bg-gray-800 hover:text-slate-200"
          >
            Cancel
          </Link>
        </div>
      </form>
    </main>
  );
}
