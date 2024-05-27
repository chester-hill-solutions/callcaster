import { json, redirect } from "@remix-run/node";
import { Form, Link, useActionData } from "@remix-run/react";
import { FaGithub } from "react-icons/fa";
import { FcGoogle } from "react-icons/fc";
import { Button } from "~/components/ui/button";
import {
  createSupabaseServerClient,
} from "~/lib/supabase.server";

export const action = async ({ request }: { request: Request }) => {
  const { supabaseClient, headers } = createSupabaseServerClient(request);

  const formData = await request.formData();

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email: email,
    password: password,
  });
  if (!error) {
    return redirect("/workspaces", { headers });
  } else {
    console.log(error);
    return json({ error: error.message });
  }
};

export const loader = async ({ request }: { request: Request }) => {
  const { headers } = createSupabaseServerClient(request);
  return json({ success: true }, { headers });
};

export default function SignIn() {
  const actionData = useActionData<typeof action>();
  return (
    <main className="flex h-screen w-full flex-col items-center justify-center py-4 text-slate-800">
      <div
        id="login-hero"
        className="flex aspect-square flex-col items-center justify-center gap-5 rounded-md bg-brand-secondary px-28 py-8 shadow-sm"
      >
        <h1 className="mb-4 font-Zilla-Slab text-6xl font-bold text-slate-800">
          Login
        </h1>

        {actionData?.error && (
          <p style={{ color: "red" }}>{actionData.error}</p>
        )}
        <Button
          variant={"outline"}
          className="flex min-h-[56px] w-full gap-2 border-2 border-slate-800 bg-transparent font-Zilla-Slab text-xl font-semibold"
        >
          <FcGoogle size={"2rem"} />
          Sign in with Google
        </Button>
        <Button
          variant={"outline"}
          className="flex min-h-[56px] w-full gap-2 border-2 border-slate-800 bg-transparent font-Zilla-Slab text-xl font-semibold"
        >
          <FaGithub size={"2rem"} />
          Sign in with Github
        </Button>

        <div className="flex w-full items-center justify-center gap-2">
          <div className="w-full border border-slate-800" />
          <p className="font-regular font-Zilla-Slab text-xl text-slate-800">
            OR
          </p>
          <div className="w-full border border-slate-800" />
        </div>

        <Form
          method="POST"
          className="flex w-full flex-col gap-4"
          id="signin-form"
        >
          <label
            htmlFor="email"
            className="flex w-full flex-col font-Zilla-Slab text-2xl font-semibold tracking-[1px]"
          >
            Email
            <input
              type="text"
              name="email"
              id="email"
              className="w-full rounded-sm border-2 border-slate-800 bg-transparent px-4 py-2"
            />
          </label>

          <label
            htmlFor="password"
            className="flex w-full flex-col font-Zilla-Slab text-2xl font-semibold tracking-[1px]"
          >
            Password
            <input
              type="password"
              name="password"
              id="password"
              className="w-full rounded-sm border-2 border-slate-800 bg-transparent px-4 py-2"
            />
          </label>
        </Form>

        <Button
          className="min-h-[48px] rounded-md bg-brand-primary px-16 py-2 font-Zilla-Slab text-3xl font-bold tracking-[1px] text-white
            transition-colors duration-150 ease-in-out hover:text-black"
          type="submit"
          form="signin-form"
        >
          Login
        </Button>
        <Link
          to={"/signup"}
          className="font-Zilla-Slab text-xl font-bold tracking-[1px] text-slate-800 hover:underline"
        >
          Don't Have an Account Yet? Click{" "}
          <span className="text-brand-primary">HERE</span> to Sign-Up!
        </Link>
        <Link
          to={"/remember"}
          className="font-Zilla-Slab text-xl font-bold tracking-[1px] text-brand-tertiary hover:underline"
        >
          I forgot my password
        </Link>
      </div>
    </main>
  );
}
