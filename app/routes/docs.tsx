import { useEffect, useState } from "react";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { ApiReferenceReact } from "@scalar/api-reference-react";
import "@scalar/api-reference-react/style.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const origin = url.origin;
  return { specUrl: `${origin}/api/docs/openapi` };
};

export default function DocsPage() {
  const { specUrl } = useLoaderData<typeof loader>();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
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
