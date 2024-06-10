import { type MetaFunction } from "@remix-run/node";
import { Form, json, Link, redirect } from "@remix-run/react";
import { FaGithub } from "react-icons/fa";
import { FcGoogle } from "react-icons/fc";
import { Button } from "~/components/ui/button";
import { getSupabaseServerClientWithSession } from "~/lib/supabase.server";

export const meta: MetaFunction = () => {
  return [
    { title: "Callcaster Outreach Platform" },
    { name: "description", content: "Real-Time Connections, Real Results" },
  ];
};

export const loader = async ({ request }: { request: Request }) => {
  const { headers, serverSession } =
    await getSupabaseServerClientWithSession(request);
  return json({ headers });
};

export default function Index() {
  return (
    <main className="flex h-full w-full items-center justify-center gap-16 px-16 py-32 text-white">
      <div className="">
        <h1 className="text-center font-Tabac-Slab text-6xl font-black text-brand-primary">
          CallCaster
        </h1>
        <p className="text-center font-Zilla-Slab text-3xl font-black text-slate-800 dark:text-slate-200">
          Real-Time Connections, Real Results.
        </p>
      </div>

      <div
        id="login-card"
        className="flex aspect-square flex-col items-center justify-center gap-5 rounded-md bg-brand-secondary px-24 pb-12 pt-8 shadow-lg dark:border-2 dark:border-white dark:bg-zinc-900 dark:bg-opacity-80 dark:shadow-none"
      >
        <h2 className="mb-4 font-Zilla-Slab text-6xl font-bold text-brand-primary dark:text-white">
          Login
        </h2>

        <Button
          variant={"outline"}
          className="flex min-h-[56px] w-full gap-2 border-2 border-black bg-transparent font-Zilla-Slab text-xl font-semibold text-black dark:border-white dark:text-white dark:hover:bg-white dark:hover:text-black"
        >
          <FcGoogle size={"2rem"} />
          Sign in with Google
        </Button>
        <Button
          variant={"outline"}
          className="flex min-h-[56px] w-full gap-2 border-2 border-black bg-transparent font-Zilla-Slab text-xl font-semibold text-black dark:border-white dark:text-white dark:hover:bg-white dark:hover:text-black"
        >
          <FaGithub size={"2rem"} />
          Sign in with Github
        </Button>

        <div className="flex w-full items-center justify-center gap-2">
          <div className="w-full border border-brand-primary dark:border-brand-secondary" />
          <p className="font-Zilla-Slab text-xl font-semibold text-brand-primary dark:text-brand-secondary">
            OR
          </p>
          <div className="w-full border border-brand-primary dark:border-brand-secondary" />
        </div>

        <Form
          id="homepage-signin-form"
          method="POST"
          className="flex w-full flex-col gap-4"
          action="/signin"
        >
          <label
            htmlFor="email"
            className="flex w-full flex-col font-Zilla-Slab text-2xl font-semibold tracking-[1px] text-black dark:text-white"
          >
            Email
            <input
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
              type="password"
              name="password"
              id="password"
              className="w-full rounded-sm border-2 border-black bg-transparent px-4 py-2 text-black dark:border-white dark:text-white"
            />
          </label>
        </Form>
        <div className="flex w-full gap-4">
          <Button
            size={null}
            className="w-full rounded-md bg-brand-primary py-2 font-Zilla-Slab text-3xl font-bold tracking-[1px] text-white
            transition-colors duration-150 ease-in-out hover:bg-brand-secondary hover:bg-white hover:text-black"
            type="submit"
            form="homepage-signin-form"
          >
            Login
          </Button>
          <Link
            to={"/signup"}
            className="w-full rounded-md bg-gray-300 px-3 py-2 text-center font-Zilla-Slab text-3xl font-bold
          text-black transition-colors duration-150 ease-in-out hover:bg-gray-700 hover:text-white"
          >
            Sign Up
          </Link>
        </div>
        {/* <Link
          to={"/signup"}
          className="text-center font-Zilla-Slab text-xl font-bold tracking-[1px] text-black transition-all
            duration-150 hover:text-brand-primary hover:underline dark:text-brand-secondary dark:hover:text-brand-primary"
        >
          Don't Have an Account Yet?
          <br />
          Click <span className="text-brand-primary">HERE</span> to Sign-Up!
        </Link> */}
      </div>
      <img
        alt="background"
        src="/Hero-1.png"
        className="absolute left-0 top-[10px] z-[-1] h-screen w-screen overflow-hidden object-cover opacity-10"
      />
    </main>
  );
}
