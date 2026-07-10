import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  isRouteErrorResponse,
  useLoaderData,
  useNavigate,
  useNavigation,
  useRouteError,
} from "react-router";
import type { LinksFunction, MetaFunction } from "react-router";
import { useCallback } from "react";
import { Toaster } from "sonner";

import Navbar from "@/components/layout/Navbar";
import { ThemeProvider } from "@/components/shared/theme-provider";
import stylesheet from "@/tailwind.css?url";

import type { RootLoaderData } from "./root.loader.server";

export { loader } from "./root.loader.server";
export type { RootLoaderData } from "./root.loader.server";

export const meta: MetaFunction = () => [
  { title: "CallCaster" },
  {
    name: "description",
    content: "Outbound calling and SMS campaigns for teams.",
  },
];

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: stylesheet },
  { rel: "icon", href: "/favicon.ico" },
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

function GlobalNavigationIndicator() {
  const navigation = useNavigation();
  if (navigation.state === "idle") {
    return null;
  }
  return (
    <div
      aria-hidden
      className="fixed left-0 top-0 z-[100] h-0.5 w-full overflow-hidden bg-brand-primary/20"
    >
      <div className="h-full w-full animate-pulse bg-brand-primary" />
    </div>
  );
}

export default function App() {
  const { env, session, workspaces, user, params } =
    useLoaderData<RootLoaderData>();

  const isSignedIn = session?.token != null;
  const navigate = useNavigate();

  const signOut = useCallback(async (): Promise<{
    success: string | null;
    error: string | null;
  }> => {
    const response = await fetch("/api/auth/signout", {
      method: "POST",
      credentials: "include",
    });

    if (!response.ok) {
      return { success: null, error: "Sign out failed" };
    }

    navigate("/");
    return { success: "Sign off successful", error: null };
  }, [navigate]);

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
          <GlobalNavigationIndicator />
          <Navbar
            className="bg-brand-secondary"
            handleSignOut={signOut}
            workspaces={workspaces}
            isSignedIn={isSignedIn}
            user={user ?? null}
            params={params}
          />
          <Outlet context={{ env }} />
          <Toaster position="top-right" richColors visibleToasts={3} />
          <ScrollRestoration />
          <Scripts />
        </ThemeProvider>
      </body>
    </html>
  );
}

const SUPPORT_EMAIL = "info@callcaster.ca";

function ErrorShell({
  title,
  heading,
  body,
}: {
  title: string;
  heading: string;
  body: string;
}) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title}</title>
        <Meta />
        <Links />
      </head>
      <body className="min-h-screen bg-background">
        <main className="flex min-h-screen items-center justify-center p-6">
          <div className="w-full max-w-md text-center">
            <p className="font-Tabac-Slab text-2xl font-black text-brand-primary">
              CallCaster
            </p>
            <h1 className="mt-6 text-3xl font-semibold text-foreground">
              {heading}
            </h1>
            <p className="mt-3 text-base text-muted-foreground">
              {body}
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <a
                href="/"
                className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90"
              >
                Go home
              </a>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="inline-flex items-center rounded-md border border-input px-4 py-2 text-foreground hover:bg-accent hover:text-accent-foreground"
              >
                Try again
              </button>
            </div>
            <p className="mt-6 text-sm text-muted-foreground">
              Still stuck?{" "}
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="text-brand-primary underline"
              >
                Contact support
              </a>
            </p>
          </div>
        </main>
        <Scripts />
      </body>
    </html>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();

  if (isRouteErrorResponse(error)) {
    const isNotFound = error.status === 404;
    return (
      <ErrorShell
        title={`${error.status} — CallCaster`}
        heading={isNotFound ? "Page not found" : `${error.status} ${error.statusText}`}
        body={
          isNotFound
            ? "The page you're looking for doesn't exist or may have moved."
            : typeof error.data === "string" && error.data
              ? error.data
              : "Something went wrong handling your request."
        }
      />
    );
  }

  // Log the real error for operators; never surface internals to the user.
  console.error("Root ErrorBoundary caught:", error);

  return (
    <ErrorShell
      title="Unexpected error — CallCaster"
      heading="Something went wrong"
      body="An unexpected error occurred on our end. Your data is safe — please try again, and reach out if the problem continues."
    />
  );
}
