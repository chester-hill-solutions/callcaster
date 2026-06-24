export { loader } from "./audios.loader.server";

import { Link, useLoaderData } from "react-router";
import { QueryParamBanner } from "@/components/shared/QueryParamBanner";
import { mediaColumns } from "@/components/file-assets/columns";
import { DataTable } from "@/components/workspace/tables/DataTable";
import { WorkspaceResourceListShell } from "@/components/workspace/WorkspaceResourceListShell";
import { Button } from "@/components/ui/button";

import type { FileObject } from "@supabase/storage-js";

type LoaderData = {
  audioMedia: FileObject[] | null;
  workspace: { name: string } | null;
  error: string | null;
  userRole: unknown;
};

export default function WorkspaceAudiosPage() {
  const { audioMedia, workspace, error } = useLoaderData<LoaderData>();

  const isWorkspaceAudioEmpty = error === "No Audio in Workspace";
  const workspaceAudios = audioMedia?.filter(
    (media: FileObject) =>
      !media.name.includes("voicemail-undefined") &&
      !media.name.includes("voicemail-+") &&
      !media.name.includes("recording-"),
  );

  const title =
    workspace != null ? `${workspace?.name} Audio Library` : "No Workspace";

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
            className="rounded-md border-2 border-border font-semibold text-foreground"
            columns={mediaColumns}
            data={workspaceAudios}
          />
        ) : null}
      </WorkspaceResourceListShell>
    </>
  );
}
