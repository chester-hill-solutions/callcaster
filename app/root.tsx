import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  isRouteErrorResponse,
  useLoaderData,
  useNavigate,
  useRouteError,
} from "react-router";
import type { LinksFunction } from "react-router";
import { createBrowserClient } from "@supabase/ssr";
import { useEffect, useMemo } from "react";
import { Toaster } from "sonner";

import Navbar from "@/components/layout/Navbar";
import { ThemeProvider } from "@/components/shared/theme-provider";
import stylesheet from "@/tailwind.css?url";
import { Database } from "./lib/database.types";

import type { RootLoaderData } from "./root.loader.server";

export { loader } from "./root.loader.server";
export type { RootLoaderData } from "./root.loader.server";

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

export default function App() {
  const { env, session, workspaces, user, params } =
    useLoaderData<RootLoaderData>();

  const supabase = useMemo(
    () =>
      createBrowserClient<Database>(env.SUPABASE_URL!, env.SUPABASE_KEY!),
    [env.SUPABASE_KEY, env.SUPABASE_URL],
  );

  const serverAccessToken = session?.access_token;
  const navigate = useNavigate();

  async function signOut(): Promise<{
    success: string | null;
    error: string | null;
  }> {
    const { error: signOutError } = await supabase.auth.signOut();

    if (signOutError) {
      return { success: null, error: signOutError.message };
    }
    navigate("/");
    return { success: "Sign off successful", error: null };
  }

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        navigate("/reset");
      }
    });

    return () => {
      data.subscription.unsubscribe();
    };
  }, [navigate, serverAccessToken, supabase]);

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var t=localStorage.getItem("callcaster-theme");if(t==="dark")document.documentElement.classList.add("dark");else if(t==="light")document.documentElement.classList.remove("dark");else if(window.matchMedia("(prefers-color-scheme: dark)").matches)document.documentElement.classList.add("dark");else document.documentElement.classList.remove("dark");})();`,
          }}
        />
        <Links />
      </head>
      <body className="min-h-screen bg-background">
        <ThemeProvider
          defaultTheme="light"
          storageKey="callcaster-theme"
          attribute="class"
        >
          <Navbar
            className="bg-brand-secondary"
            handleSignOut={signOut}
            workspaces={workspaces}
            isSignedIn={serverAccessToken != null}
            user={user ?? null}
            params={params}
          />
          <Outlet context={{ env, supabase }} />
          <Toaster position="top-right" richColors visibleToasts={3} />
          <ScrollRestoration />
          <Scripts />
        </ThemeProvider>
      </body>
    </html>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : "An unexpected error occurred";

  return (
    <html lang="en">
      <body>
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-6 text-center">
            <h3 className="text-lg font-medium text-gray-900">
              Something went wrong
            </h3>
            <p className="mt-2 text-sm text-gray-500">{message}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-4 inline-flex items-center px-4 py-2 rounded-md text-white bg-red-600 hover:bg-red-700"
            >
              Reload Page
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
