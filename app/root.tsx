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
import { createSupabaseServerClient } from "./supabase.server";
import { createBrowserClient } from "@supabase/ssr";
import { useTwilioDevice } from "./hooks/useTwilioDevice";
import stylesheet from "~/tailwind.css";

export const links: LinksFunction = () => [
  ...(cssBundleHref ? [{ rel: "stylesheet", href: cssBundleHref }] : []),
];

export const loader = async ({ request }) => {
  const env = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_KEY: process.env.SUPABASE_ANON_KEY,
    BASE_URL: process.env.BASE_URL,
  };

  const response = new Response();
  const { supabaseClient: supabase, headers } =
    createSupabaseServerClient(request);
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let token;
  if (user) {
    await fetch(`${process.env.PUBLIC_URL}/api/token?id=${user.id}`, {
      headers: { "Content-Type": "application/json" },
    })
      .then((res) => res.json())
      .then((data) => (token = data.token));
  }
  return json(
    {
      env,
      session,
      token,
    },
    {
      headers: response.headers,
    }
  );
};
export default function App() {
  const { env, session, token } = useLoaderData();
  const { revalidate } = useRevalidator();
  const supabase = createBrowserClient(env.SUPABASE_URL, env.SUPABASE_KEY);
  const serverAccessToken = session?.access_token;
  const twilioDevice = useTwilioDevice(token || null);

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
        <Outlet context={{ supabase, env, twilioDevice }} />
        <ScrollRestoration />
        <Scripts />
        <LiveReload />
      </body>
    </html>
  );
}
