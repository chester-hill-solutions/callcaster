import { useEffect, useRef, useState } from "react";
import type { LinksFunction, MetaFunction } from "react-router";
import type { AnyApiReferenceConfiguration } from "@scalar/types/api-reference";
import scalarStyles from "@scalar/api-reference-react/style.css?url";

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: scalarStyles },
];

export const meta: MetaFunction = () => [
  { title: "CallCaster API Docs" },
  {
    name: "description",
    content: "Interactive OpenAPI documentation for the CallCaster public API.",
  },
];

const scalarConfiguration: Pick<
  AnyApiReferenceConfiguration,
  "theme" | "layout" | "url"
> = {
  url: "/api/docs/openapi",
  theme: "default",
  layout: "modern",
};

function DocsLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center text-muted-foreground">
      Loading API docs…
    </div>
  );
}

export default function DocsPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    let destroy: (() => void) | undefined;

    void (async () => {
      try {
        const { createApiReference } = await import("@scalar/api-reference");
        if (cancelled) return;

        const instance = createApiReference(container, scalarConfiguration);
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
  }, []);

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
      {status === "loading" ? <DocsLoading /> : null}
      <div ref={containerRef} className="min-h-screen" />
    </div>
  );
}
