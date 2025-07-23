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
  Outlet,
  Params,
  Scripts,
  ScrollRestoration,
  json,
  redirect,
  useLoaderData,
  useNavigate,
} from "@remix-run/react";
import { createBrowserClient } from "@supabase/ssr";
import { useEffect } from "react";
import { createSupabaseServerClient } from "~/lib/supabase.server";

import Navbar from "~/components/Navbar";
import type { ENV, User, WorkspaceData, WorkspaceInvite } from "~/lib/types";
import stylesheet from "~/tailwind.css";
import { Database } from "./lib/database.types";

import { Session } from "@supabase/supabase-js";


type LoaderData = {
  env: ENV;
  session: Session;
  workspaces: WorkspaceData[] | null;
  user: User & { workspace_invite: WorkspaceInvite[] } | null;
  params: Params<string>;
};  

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
    SUPABASE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY,
    BASE_URL: process.env.BASE_URL,
  };
  
  const url = new URL(request.url);
  const qParam = url.searchParams.get('q');

  // Check if this is a survey link with encoded contact and survey info
  if (qParam) {
    try {
      const decoded = atob(qParam);
      const [contactId, surveyId] = decoded.split(':');
        
      if (contactId && surveyId) {
        return redirect(`/survey/${surveyId}?contact=${contactId}`);
      }
    } catch (error) {
      // If decoding fails, continue with normal flow
      console.error('Failed to decode survey link:', error);
    }
  }
  
  const { supabaseClient: supabase, headers } = createSupabaseServerClient(request);
  const { data: { session } } = await supabase.auth.getSession();
  const user = await supabase.auth.getUser();
  if (!user.data.user) {
    return json({
      env,
      session,  
      workspaces: null,
      user: null,
      params,
    }, { headers });
  }
  const { data: userData, error: userError } = await supabase
    .from("user")
    .select(`*, workspace_invite(workspace(id, name))`)
    .eq("id", user.data.user.id)
    .single();

  const { data: workspaceData, error: workspacesError } = await supabase
    .from("workspace_users")
    .select("workspace ( id, name )")
    .eq("user_id", user.data.user.id)
    .order("last_accessed", { ascending: false });
  if (workspacesError || userError) {
    console.error(workspacesError, userError);
  }
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
      headers: headers,
    },
  );
};

export default function App() {
  const { env, session, workspaces, user, params } = useLoaderData<LoaderData>();

  const supabase = createBrowserClient<Database>(
    env.SUPABASE_URL!,
    env.SUPABASE_KEY!,
  );
  
  const serverAccessToken = session?.access_token;
  const navigate = useNavigate();

  async function signOut(): Promise<TypedResponse<{ success: string | null; error: string | null }>> {
    const { error: signOutError } = await supabase.auth.signOut();

    if (signOutError) {
      return json({ success: null, error: signOutError.message });
    }
    navigate("/");
    return json({ success: "Sign off successful", error: null });
  }

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        redirect("/reset")
      }
    });

    return () => {
      data.subscription.unsubscribe();
    };
  }, [serverAccessToken, supabase]);

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
        <Navbar
          className="bg-brand-secondary"
          handleSignOut={signOut}
          workspaces={workspaces}
          isSignedIn={serverAccessToken != null}
          user={user ?? null}
          params={params}
        />
        <Outlet context={{ env, supabase }} />
        <ScrollRestoration />
        <Scripts />
        <LiveReload />
      </body>
    </html>
  );
}
