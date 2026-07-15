import { useEffect, useRef, useState } from "react";
import type { LinksFunction, MetaFunction } from "react-router";
import { useSearchParams } from "react-router";
import scalarStyles from "@scalar/api-reference-react/style.css?url";

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: scalarStyles },
];

export const meta: MetaFunction = () => [
  { title: "CallCaster API Docs" },
  {
    name: "description",
    content:
      "Interactive OpenAPI documentation for CallCaster public and complete API surfaces.",
  },
];

type DocsSpec = "public" | "complete";

const SPEC_CONFIG: Record<
  DocsSpec,
  {
    url: string;
    title: string;
    description: string;
  }
> = {
  public: {
    url: "/api/docs/openapi",
    title: "Public API",
    description:
      "Everything a signed-in user (or API key) can use to run a workspace: campaigns, contacts, audiences, scripts, dialer/call-screen, messaging, exports, and workspace admin. Webhooks and internal telephony workers are in Complete Surface.",
  },
  complete: {
    url: "/api/docs/openapi/all",
    title: "Complete API Surface",
    description:
      "Full inventory including Twilio/Stripe webhooks, internal telephony workers, and documented security gaps — not all routes belong in the public user API.",
  },
};

function DocsLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center text-muted-foreground">
      Loading API docs…
    </div>
  );
}

export default function DocsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const specParam = searchParams.get("spec");
  const spec: DocsSpec = specParam === "complete" ? "complete" : "public";
  const config = SPEC_CONFIG[spec];

  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  /**
   * @effect Dynamically import and imperatively mount the Scalar API-reference widget into containerRef for the active spec.
   * @effect-deps config.url — remounts the widget against the newly selected spec (public vs. complete) when it changes.
   * @effect-side-effects dom (imperative third-party widget mount) + dynamic import; instance destroyed on cleanup/re-run.
   * @effect-why-not-loader Scalar's `createApiReference` is an imperative DOM-mounting API from a lazily-loaded client bundle, not data a loader could hand to a component tree.
   */
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    let destroy: (() => void) | undefined;

    void (async () => {
      try {
        setStatus("loading");
        const { createApiReference } = await import("@scalar/api-reference");
        if (cancelled) return;

        const instance = createApiReference(container, {
          url: config.url,
          theme: "default",
          layout: "modern",
        });
        destroy = () => instance.destroy();
        setStatus("ready");
      } catch (error: unknown) {
        if (cancelled) return;
        setErrorMessage(
          error instanceof Error ? error.message : "Failed to load API docs",
        );
        setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      destroy?.();
    };
  }, [config.url]);

  const setSpec = (next: DocsSpec) => {
    if (next === "public") {
      searchParams.delete("spec");
    } else {
      searchParams.set("spec", "complete");
    }
    setSearchParams(searchParams, { replace: true });
  };

  if (status === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 text-center text-muted-foreground">
        <div>
          <p className="font-medium text-foreground">Could not load API docs</p>
          <p className="mt-2 text-sm">{errorMessage}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-background/95 px-4 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4">
          <div className="flex flex-col gap-1">
            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
              CallCaster Docs
            </p>
            <h1 className="font-Zilla-Slab text-2xl font-bold text-foreground sm:text-3xl">
              {config.title}
            </h1>
            <p className="max-w-4xl text-sm text-muted-foreground">
              {config.description}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setSpec("public")}
              className={`rounded-md px-3 py-1.5 text-sm ${
                spec === "public"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              Public API
            </button>
            <button
              type="button"
              onClick={() => setSpec("complete")}
              className={`rounded-md px-3 py-1.5 text-sm ${
                spec === "complete"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              Complete Surface
            </button>
            <a
              href="https://github.com/chester-hill-solutions/callcaster/blob/master/docs/README.md"
              className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              target="_blank"
              rel="noreferrer"
            >
              Human guides
            </a>
          </div>
        </div>
      </header>
      {status === "loading" ? <DocsLoading /> : null}
      <div
        ref={containerRef}
        className="mx-auto min-h-[calc(100vh-7.5rem)] w-full max-w-[1600px] [&_.sidebar]:min-w-[240px]"
      />
    </div>
  );
}
