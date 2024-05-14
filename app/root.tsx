/* eslint-disable @typescript-eslint/no-unused-vars */
import { useEffect } from "react";
import { cssBundleHref } from "@remix-run/css-bundle";
import type { LinksFunction } from "@remix-run/node";
import {
  Links,
  LiveReload,
  json,
  useRevalidator,
  useLoaderData,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "@remix-run/react";
import { createSupabaseServerClient } from "~/lib/supabase.server";
import { createBrowserClient } from "@supabase/ssr";

import stylesheet from "~/tailwind.css";

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: stylesheet },
];

export const loader = async ({ request }) => {
  const env = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_KEY: process.env.SUPABASE_KEY,
    BASE_URL: process.env.BASE_URL,
  };
  const response = new Response();
  const { supabaseClient: supabase, headers } =
    createSupabaseServerClient(request);
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return json(
    {
      env,
      session,
    },
    {
      headers: response.headers,
    },
  );
};
export default function App() {
  const { env, session } = useLoaderData();
  const { revalidate } = useRevalidator();
  const supabase = createBrowserClient(env.SUPABASE_URL, env.SUPABASE_KEY);
  const serverAccessToken = session?.access_token;

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.access_token !== serverAccessToken) {
        supabase.auth.getSession();
      }
    });

    return () => {
      data.subscription.unsubscribe();
    };
  }, [serverAccessToken, supabase, revalidate]);

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body className="flex min-h-screen bg-foreground">
        <Outlet context={{ supabase, env }} />
        <ScrollRestoration />
        <Scripts />
        <LiveReload />
      </body>
    </html>
  );
}
