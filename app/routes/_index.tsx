import { type MetaFunction } from "@remix-run/node";
import { Form, json, Link, redirect } from "@remix-run/react";
import { FaGithub } from "react-icons/fa";
import { FcGoogle } from "react-icons/fc";
import Navbar from "~/components/Navbar";
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
    <main className="mx-auto flex h-full w-full items-center justify-center text-white bg-[url('/Hero')]">
        <div className="w-400 mx-auto py-40">
          <h1 className="text-center font-Tabac-Slab text-6xl font-black text-brand-primary">
            CallCaster
          </h1>
          <p className="text-center font-Zilla-Slab text-3xl font-black text-slate-800 dark:text-slate-200">
            Real-Time Connections, Real Results.
          </p>
          <div style={{ height: "20px" }}></div>
          <div className="flex flex-col">
            <a
              className="text-center font-Zilla-Slab text-3xl font-black text-slate-800 dark:text-slate-200"
              href="mailto:info@callcaster.com"
            >
              info@callcaster.ca
            </a>
            <a
              className="text-center font-Zilla-Slab text-3xl font-black text-slate-800 dark:text-slate-200"
              href="tel:+13656459045"
            >
              365 645 9045
            </a>
          </div>
        </div>
    </main>
  );
}
