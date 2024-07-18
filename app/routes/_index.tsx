import { type MetaFunction } from "@remix-run/node";
import { Form, json, Link, redirect } from "@remix-run/react";
import { Button } from "~/components/ui/button";
import { getSupabaseServerClientWithSession } from "~/lib/supabase.server";
import { Card, CardActions, CardContent, CardSecondaryActions, CardTitle } from "~/components/CustomCard";
import { MdOutlineArrowDropDown } from "react-icons/md";

export default function Index() {
  return (
    <main className="flex min-h-screen flex-col items-center px-4 py-8 sm:px-6 lg:px-8 relative overflow-hidden">
      <div className="w-full max-w-md space-y-8 z-10">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-brand-primary font-Tabac-Slab mb-2">
            CallCaster
          </h1>
          <p className="text-xl font-semibold text-slate-800 dark:text-slate-200 font-Zilla-Slab">
            Real Time Connections, Real Conversations,<br/>
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
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                  Email
                </label>
                <input
                  type="email"
                  name="email"
                  id="email"
                  required
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-brand-primary focus:border-brand-primary dark:bg-zinc-800 dark:border-gray-600 dark:text-white"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                  Password
                </label>
                <input
                  type="password"
                  name="password"
                  id="password"
                  required
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-brand-primary focus:border-brand-primary dark:bg-zinc-800 dark:border-gray-600 dark:text-white"
                />
              </div>
            </Form>
          </CardContent>
          <CardActions>
            <Button
              size="lg"
              className="w-full bg-brand-primary text-white hover:bg-brand-secondary font-Zilla-Slab"
              type="submit"
              form="homepage-signin-form"
            >
              Login
            </Button>
            <Link
              to="/signup"
              className="w-full px-4 py-2 text-center font-bold text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300 transition duration-150 ease-in-out dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600 font-Zilla-Slab"
            >
              Sign Up
            </Link>
          </CardActions>
        </Card>
      </div>

      <img
        alt="background"
        src="/Hero-1.png"
        className="absolute inset-0 w-full h-full object-cover opacity-10 z-0"
      />
    </main>
  );
}