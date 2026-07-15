export { loader } from "./voicemails.loader.server";

import { Link, Outlet, useLoaderData, useOutlet, useOutletContext } from "react-router";
import { Voicemail } from "lucide-react";
import { mediaColumns } from "@/components/file-assets/columns";
import { QueryParamBanner } from "@/components/shared/QueryParamBanner";
import { DataTable } from "@/components/workspace/tables/DataTable";
import { WorkspaceResourceListShell } from "@/components/workspace/WorkspaceResourceListShell";
import { Button } from "@/components/ui/button";

import { ContextType } from "@/lib/types";

export default function WorkspaceVoicemailsPage() {
  const outlet = useOutlet();
  const parentContext = useOutletContext<ContextType>();
  const { audioMedia, error } = useLoaderData();

  if (outlet) {
    return <Outlet context={parentContext} />;
  }

  const isWorkspaceAudioEmpty = error === "No Audio in Workspace";
  const voicemails = audioMedia;

  const setUpAction = (
    <Button asChild className="font-Zilla-Slab text-lg font-semibold">
      <Link to="./setup">Set up voicemail</Link>
    </Button>
  );

  return (
    <>
      <QueryParamBanner
        param="configured"
        variants={{
          "1": {
            title: "Voicemail is set up",
            description:
              "Callers will hear your greeting and can leave a message. Their messages will show up here.",
          },
        }}
      />
      <WorkspaceResourceListShell
        title="Voicemails"
        error={error}
        isEmpty={isWorkspaceAudioEmpty}
        emptyMessage="No voicemails yet"
        emptyDescription="Messages callers leave will appear here. Set up a greeting so callers know they can leave one."
        emptyIcon={<Voicemail className="h-7 w-7" aria-hidden="true" />}
        addAction={setUpAction}
      >
        {voicemails != null && !isWorkspaceAudioEmpty ? (
          <DataTable
            className="font-semibold text-foreground"
            columns={mediaColumns}
            data={voicemails}
          />
        ) : null}
      </WorkspaceResourceListShell>
    </>
  );
}

export { RouteErrorBoundary as ErrorBoundary } from "@/components/shared/RouteErrorBoundary";
