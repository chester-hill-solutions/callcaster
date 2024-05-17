import type { MetaFunction } from "@remix-run/node";
import { Form, json, Link, redirect } from "@remix-run/react";
import { FaGithub } from "react-icons/fa";
import { FcGoogle } from "react-icons/fc";
import { Button } from "~/components/ui/button";
import { getSupabaseServerClientWithSession } from "~/lib/supabase.server";

export const meta: MetaFunction = () => {
  return [
    { title: "Callcaster Pre-Alpha" },
    { name: "description", content: "Early dev build of callcaster" },
  ];
};

export const loader = async ({ request }: { request: Request }) => {
  const { headers, serverSession } =
    await getSupabaseServerClientWithSession(request);

  if (serverSession && serverSession.user) {
    redirect("/workspaces", { headers });
  }

  return json({ headers });
};

export default function Index() {
  return (
    <main className="mx-auto flex h-full w-full items-center text-white">
      <section
        id="index_hero"
        className="flex h-full w-full items-center justify-center gap-64 px-20 py-12"
      >
        <div className="flex flex-col items-center gap-4 text-center">
          <h3 className="font-Tabac-Slab text-[14rem] font-black italic leading-none text-brand-primary">
            CC
          </h3>
          <p className="font-Zilla-Slab text-4xl font-bold tracking-[0.5px] text-brand-primary">
            Affordable Outreach
            <br />
            Made Simple
          </p>
        </div>

        <div
          id="login-card"
          className="flex aspect-square flex-col items-center justify-center gap-5 rounded-md bg-card px-28 py-8 shadow-sm"
        >
          <h2 className="mb-4 font-Zilla-Slab text-6xl font-bold text-brand-secondary">
            Login
          </h2>

          <Button
            variant={"outline"}
            className="flex min-h-[56px] w-full gap-2 border-2 border-white bg-foreground font-Zilla-Slab text-xl font-semibold"
          >
            <FcGoogle size={"2rem"} />
            Sign in with Google
          </Button>
          <Button
            variant={"outline"}
            className="flex min-h-[56px] w-full gap-2 border-2 border-white bg-foreground font-Zilla-Slab text-xl font-semibold"
          >
            <FaGithub size={"2rem"} />
            Sign in with Github
          </Button>

          <div className="flex w-full items-center justify-center gap-2">
            <div className="w-full border border-brand-secondary" />
            <p className="font-regular font-Zilla-Slab text-xl text-brand-secondary">
              OR
            </p>
            <div className="w-full border border-brand-secondary" />
          </div>

          <Form
            id="homepage-signin-form"
            method="POST"
            className="flex w-full flex-col gap-4"
            action="/signin"
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
                className="w-full rounded-sm border-2 border-white bg-transparent px-4 py-2"
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
                className="w-full rounded-sm border-2 border-white bg-transparent px-4 py-2"
              />
            </label>
          </Form>

          <Button
            className="min-h-[48px] rounded-md bg-brand-primary px-16 py-2 font-Zilla-Slab text-3xl font-bold tracking-[1px] text-white
            transition-colors duration-150 ease-in-out hover:bg-brand-secondary hover:text-black"
            type="submit"
            form="homepage-signin-form"
          >
            Login
          </Button>
          <Link
            to={"/signup"}
            className="text-center font-Zilla-Slab text-xl font-bold tracking-[1px] text-brand-secondary
            transition-all duration-150 hover:underline"
          >
            Don't Have an Account Yet?
            <br />
            Click <span className="text-brand-primary">HERE</span> to Sign-Up!
          </Link>
          {/* <Link
              to={"/signup"}
              className="rounded-md bg-gray-300 px-3 py-2 font-bold text-black
            transition-colors duration-150 ease-in-out hover:bg-gray-700 hover:text-white"
            >
              Sign Up
            </Link> */}
        </div>
      </section>
    </main>
  );
}
