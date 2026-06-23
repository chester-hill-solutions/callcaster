import { useEffect, useState } from "react";
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

export async function loader() {
  return {};
}

const scalarConfiguration: AnyApiReferenceConfiguration = {
  url: "/api/docs/openapi",
  theme: "default",
  layout: "modern",
};

export default function DocsPage() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Loading API docs…
      </div>
    );
  }

  return <ScalarDocs configuration={scalarConfiguration} />;
}

function ScalarDocs({
  configuration,
}: {
  configuration: AnyApiReferenceConfiguration;
}) {
  const [ApiReference, setApiReference] = useState<
    typeof import("@scalar/api-reference-react").ApiReferenceReact | null
  >(null);

  useEffect(() => {
    void import("@scalar/api-reference-react").then(({ ApiReferenceReact }) => {
      setApiReference(() => ApiReferenceReact);
    });
  }, []);

  if (!ApiReference) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Loading API docs…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <ApiReference configuration={configuration} />
    </div>
  );
}
