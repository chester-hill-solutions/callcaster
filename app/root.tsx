/* eslint-disable @typescript-eslint/no-unused-vars */
import { useEffect, useState } from "react";
import type {
  LinksFunction,
  LoaderFunctionArgs,
  TypedResponse,
} from "@remix-run/node";
import { Device } from "twilio-client";
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
import {useTwilioDevice} from "./hooks/useTwilioDevice"
// Remix-Themes Imports
// import clsx from "clsx";
// import {
//   PreventFlashOnWrongTheme,
//   Theme,
//   ThemeProvider,
//   useTheme,
// } from "remix-themes";
// import { themeSessionResolver } from "./sessions.server";

import { ThemeProvider } from "./components/theme-provider";

import stylesheet from "~/tailwind.css";
import type { ENV } from "~/lib/types";
import Navbar from "~/components/Navbar";
import { Database } from "./lib/database.types";

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: stylesheet },
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Zilla+Slab:ital,wght@0,300;0,400;0,500;0,600;0,700;1,300;1,400;1,500;1,600;1,700&display=swap",
  },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const env: ENV = {
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
  let token;
  if (session?.user) {
    const { token: newToken } = await fetch(
      `${process.env.PUBLIC_URL}/api/token?id=${session.user.id}`,
    ).then((res) => res.json());
    token = newToken;
  }
  // const { getTheme } = await themeSessionResolver(request);

  return json(
    {
      env,
      session,
      token,
    },
    {
      headers: response.headers,
    },
    // theme: getTheme(),
  );

  // Wrapper for Implementing Remix-Themes
  // export default function AppWithProviders() {
  //   const { revalidate } = useRevalidator();
  //   const data = useLoaderData<typeof loader>();
  //   // console.log(data.theme);
  //   return (
  //     <ThemeProvider specifiedTheme={data.theme} themeAction="/action/set-theme">
  //       <App />
  //     </ThemeProvider>
  //   );
  // }
};

export default function App() {
  const { env, session, token } = useLoaderData<typeof loader>();
  const device = useTwilioDevice(token)
  const { revalidate } = useRevalidator();
  const supabase = createBrowserClient<Database>(
    env.SUPABASE_URL!,
    env.SUPABASE_KEY!,
  );
  const serverAccessToken = session?.access_token;

  async function signOut() {
    const { error } = await supabase.auth.signOut();
    revalidate();
    return json({ error: error });
  }

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
        {/* <PreventFlashOnWrongTheme ssrTheme={Boolean(data.theme)} /> */}
        <Links />
      </head>
      <body className={`min-h-screen bg-background`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <Navbar className="bg-brand-secondary" handleSignOut={signOut} />
          <Outlet context={{ supabase, env, device }} />
        </ThemeProvider>
        <ScrollRestoration />
        <Scripts />
        <LiveReload />
      </body>
    </html>
  );
}
