export { loader } from "./audios.loader.server";

import {
  Link,
  Outlet,
  useLoaderData,
  useOutlet,
  useOutletContext,
} from "react-router";
import { toast } from "sonner";
import type { ContextType, FileObject } from "@/lib/types";
import { mediaColumns } from "@/components/file-assets/columns";
import { DataTable } from "@/components/workspace/tables/DataTable";
import { WorkspaceResourceListShell } from "@/components/workspace/WorkspaceResourceListShell";
import { Button } from "@/components/ui/button";
import { useSearchParamFlash } from "@/hooks/utils/useSearchParamFlash";


type LoaderData = {
  audioMedia: FileObject[] | null;
  workspace: { name: string } | null;
  error: string | null;
  userRole: unknown;
};

export default function WorkspaceAudiosPage() {
  const outlet = useOutlet();
  const parentContext = useOutletContext<ContextType>();
  const { audioMedia, workspace, error } = useLoaderData<LoaderData>();

  useSearchParamFlash({
    uploaded: (value) => {
      if (value === "1") {
        toast.success("Audio uploaded", {
          description: "Your audio file was added to this workspace.",
        });
      }
    },
  });

  if (outlet) {
    return <Outlet context={parentContext} />;
  }

  const isWorkspaceAudioEmpty = error === "No Audio in Workspace";
  const workspaceAudios = audioMedia;

  const title = "Audio Library";

  return (
    <>
      <WorkspaceResourceListShell
        title={title}
        error={error}
        isEmpty={isWorkspaceAudioEmpty}
        emptyMessage="Add Your Own Audio to this Workspace!"
        emptyDescription="Upload or record audio to use in IVR campaigns and voicemail drops."
        addAction={
          <div className="flex gap-2">
            <Button asChild variant="outline" className="font-Zilla-Slab text-lg font-semibold">
              <Link to="./record">Record audio</Link>
            </Button>
            <Button asChild className="font-Zilla-Slab text-lg font-semibold">
              <Link to="./new">Add Audio</Link>
            </Button>
          </div>
        }
      >
        {workspaceAudios != null && !isWorkspaceAudioEmpty ? (
          <DataTable
            className="font-semibold text-foreground"
            columns={mediaColumns}
            data={workspaceAudios}
          />
        ) : null}
      </WorkspaceResourceListShell>
    </>
  );
}

export { RouteErrorBoundary as ErrorBoundary } from "@/components/shared/RouteErrorBoundary";
