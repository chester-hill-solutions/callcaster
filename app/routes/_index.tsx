import { type MetaFunction } from "@remix-run/node";
import { Form, json, Link, redirect } from "@remix-run/react";
import { Button } from "~/components/ui/button";
import { getSupabaseServerClientWithSession } from "~/lib/supabase.server";
import {
  Card,
  CardActions,
  CardContent,
  CardSecondaryActions,
  CardTitle,
} from "~/components/CustomCard";
import { MdOutlineArrowDropDown } from "react-icons/md";

export default function Index() {
  return (
    <main className="relative flex min-h-screen flex-col items-center overflow-hidden px-4 py-8 sm:px-6 lg:px-8">
      <div className="z-10 w-full max-w-md space-y-8">
        <div className="text-center">
          <h1 className="mb-2 font-Tabac-Slab text-4xl font-bold text-brand-primary">
            CallCaster
          </h1>
          <p className="font-Zilla-Slab text-xl font-semibold text-slate-800 dark:text-slate-200">
            Real Time Connections, Real Conversations,
            <br />
            Real Results.
          </p>
        </div>

        <Card bgColor="bg-brand-secondary dark:bg-zinc-900">
          <CardTitle>Login</CardTitle>
          <CardContent>
            <Form
              id="homepage-signin-form"
              method="POST"
              className="space-y-6"
              action="/signin"
            >
              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-200"
                >
                  Email
                </label>
                <input
                  type="email"
                  name="email"
                  id="email"
                  required
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-brand-primary focus:outline-none focus:ring-brand-primary dark:border-gray-600 dark:bg-zinc-800 dark:text-white"
                />
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-200"
                >
                  Password
                </label>
                <input
                  type="password"
                  name="password"
                  id="password"
                  required
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-brand-primary focus:outline-none focus:ring-brand-primary dark:border-gray-600 dark:bg-zinc-800 dark:text-white"
                />
              </div>
            </Form>
          </CardContent>
          <CardActions>
            <Button
              size="lg"
              className="w-full bg-brand-primary font-Zilla-Slab text-white hover:bg-brand-secondary"
              type="submit"
              form="homepage-signin-form"
            >
              Login
            </Button>
            <Link
              to="/signup"
              className="w-full rounded-md bg-gray-200 px-4 py-2 text-center font-Zilla-Slab font-bold text-gray-700 transition duration-150 ease-in-out hover:bg-gray-300 dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600"
            >
              Sign Up
            </Link>
          </CardActions>
        </Card>
      </div>

      <img
        alt="background"
        src="/Hero-1.png"
        className="absolute inset-0 z-0 h-full w-full object-cover opacity-10"
      />
    </main>
  );
}
