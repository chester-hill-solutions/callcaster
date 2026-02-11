import { useEffect, useState } from "react";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const origin = url.origin;
  return { specUrl: `${origin}/api/docs/openapi` };
};

export default function DocsPage() {
  const { specUrl } = useLoaderData<typeof loader>();
  const [ApiReferenceReact, setApiReferenceReact] = useState<
    (typeof import("@scalar/api-reference-react"))["ApiReferenceReact"] | null
  >(null);

  useEffect(() => {
    let cancelled = false;

    // Scalar's package graph imports CSS from JS modules, which cannot run in Node SSR.
    // Load both component and styles on the client only.
    void Promise.all([
      import("@scalar/api-reference-react"),
      import("@scalar/api-reference-react/style.css"),
    ]).then(([scalarModule]) => {
      if (!cancelled) {
        setApiReferenceReact(() => scalarModule.ApiReferenceReact);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!ApiReferenceReact) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-8">
        <p className="text-muted-foreground">Loading API docs…</p>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-4rem)] w-full">
      <ApiReferenceReact
        configuration={{
          url: specUrl,
          theme: "default",
          layout: "modern",
          showSidebar: true,
          darkMode: false,
        }}
      />
    </div>
  );
}
