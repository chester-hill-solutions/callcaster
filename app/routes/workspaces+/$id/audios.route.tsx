export { loader } from "./audios.loader.server";

import {
  Link,
  Outlet,
  useLoaderData,
  useOutlet,
  useOutletContext,
} from "react-router";
import type { ContextType } from "@/lib/types";
import { QueryParamBanner } from "@/components/shared/QueryParamBanner";
import { mediaColumns } from "@/components/file-assets/columns";
import { DataTable } from "@/components/workspace/tables/DataTable";
import { WorkspaceResourceListShell } from "@/components/workspace/WorkspaceResourceListShell";
import { Button } from "@/components/ui/button";


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

  if (outlet) {
    return <Outlet context={parentContext} />;
  }

  const isWorkspaceAudioEmpty = error === "No Audio in Workspace";
  const workspaceAudios = audioMedia?.filter(
    (media: FileObject) =>
      !media.name.includes("voicemail-undefined") &&
      !media.name.includes("voicemail-+") &&
      !media.name.includes("recording-"),
  );

  const title = "Audio Library";

  return (
    <>
      <QueryParamBanner
        param="uploaded"
        variants={{
          "1": {
            title: "Audio uploaded",
            description: "Your audio file was added to this workspace.",
          },
        }}
      />
      <WorkspaceResourceListShell
        title={title}
        error={error}
        isEmpty={isWorkspaceAudioEmpty}
        emptyMessage="Add Your Own Audio to this Workspace!"
        addAction={
          <Button asChild className="font-Zilla-Slab text-lg font-semibold">
            <Link to="./new">Add Audio</Link>
          </Button>
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
