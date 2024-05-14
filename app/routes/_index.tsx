import type { MetaFunction } from "@remix-run/node";
import { Link } from "@remix-run/react";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";

export const meta: MetaFunction = () => {
  return [
    { title: "Callcaster Pre-Alpha" },
    { name: "description", content: "Early dev build of callcaster" },
  ];
};

export default function Index() {
  return (
    <main className="mx-auto flex h-screen w-full items-center text-white">
      <section
        id="index_hero"
        className="dark h-full w-full bg-card px-20 py-12"
      >
        <h1 className="text-brand-primary text-8xl">CallCaster</h1>
        <Card className="mt-32 p-8">
          <CardTitle>Reach Your Audience Faster than Ever</CardTitle>
          <CardContent></CardContent>
        </Card>
      </section>
      <section
        id="index_auth_links"
        className="dark h-full w-full bg-background px-8 py-16"
      >
        <div className="mt-32 flex aspect-square h-72 items-center justify-center gap-4 rounded-md bg-slate-900 px-8 py-4 shadow-lg">
          <Link
            to={"/signin"}
            className="rounded-md bg-sky-300 px-3 py-2 font-bold text-black
          transition-colors duration-150 ease-in-out hover:bg-white"
          >
            Sign In
          </Link>
          <Link
            to={"/signup"}
            className="rounded-md bg-gray-300 px-3 py-2 font-bold text-black
          transition-colors duration-150 ease-in-out hover:bg-gray-700 hover:text-white"
          >
            Sign Up
          </Link>
        </div>
      </section>
    </main>
  );
}
