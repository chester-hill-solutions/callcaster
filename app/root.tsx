/* eslint-disable @typescript-eslint/no-unused-vars */
import type {
  LinksFunction,
  LoaderFunctionArgs,
  TypedResponse,
} from "@remix-run/node";
import {
  Links,
  LiveReload,
  Meta,
  NavigateFunction,
  Outlet,
  Scripts,
  ScrollRestoration,
  json,
  redirect,
  useLoaderData,
  useLocation,
  useNavigate,
  useRevalidator,
} from "@remix-run/react";
import { createBrowserClient } from "@supabase/ssr";
import { useEffect } from "react";
import { createSupabaseServerClient } from "~/lib/supabase.server";

import { ThemeProvider } from "./components/theme-provider";

import Navbar from "~/components/Navbar";
import type { ENV } from "~/lib/types";
import stylesheet from "~/tailwind.css";
import { getUserWorkspaces } from "./lib/database.server";
import { Database } from "./lib/database.types";

import { Toaster } from "sonner";

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

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
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

  const { data: userData, error: userError } = await supabase
    .from("user")
    .select()
    .eq("id", session?.user.id ?? "")
    .single();

  // const { data: workspaces, error: workspaceQueryError } =
  //   await getUserWorkspaces({ supabaseClient: supabase });

  const { data: workspaceData, error: workspacesError } = await supabase
    .from("workspace_users")
    .select("workspace ( id, name )")
    .eq("user_id", session?.user.id)
    .order("last_accessed", { ascending: false });

  const workspaces = workspaceData?.map((data) => data.workspace);

  return json(
    {
      env,
      session,
      workspaces,
      user: userData,
      params,
    },
    {
      headers: response.headers,
    },
  );
};

export default function App() {
  const { env, session, workspaces, user, params } =
    useLoaderData<typeof loader>();
  const { revalidate } = useRevalidator();
  const supabase = createBrowserClient<Database>(
    env.SUPABASE_URL!,
    env.SUPABASE_KEY!,
  );
  const serverAccessToken = session?.access_token;
  const navigate = useNavigate();

  async function signOut(): Promise<
    TypedResponse<{ success: string | null; error: string | null }>
  > {
    const { error: signOutError } = await supabase.auth.signOut();
    revalidate();
    if (signOutError) {
      return json({ success: null, error: signOutError.message });
    }
    navigate("/");
    return json({ success: "Sign off successful", error: null });
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
          <Navbar
            className="bg-brand-secondary"
            handleSignOut={signOut}
            workspaces={workspaces}
            isSignedIn={serverAccessToken != null}
            user={user}
            params={params}
          />
          <Outlet context={{ supabase, env }} />
        </ThemeProvider>
        <ScrollRestoration />
        <Scripts />
        <LiveReload />
      </body>
    </html>
  );
}
