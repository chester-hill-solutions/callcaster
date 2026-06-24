export { loader } from "./voicemails.loader.server";

import { useLoaderData, useOutletContext } from "react-router";
import { mediaColumns } from "@/components/file-assets/columns";
import { DataTable } from "@/components/workspace/tables/DataTable";
import { WorkspaceResourceListShell } from "@/components/workspace/WorkspaceResourceListShell";

import { Workspace } from "@/lib/types";

export default function WorkspaceVoicemailsPage() {
  const { audioMedia, error } = useLoaderData();
  const { workspace } = useOutletContext<{ workspace: Workspace }>();
  const isWorkspaceAudioEmpty = error === "No Audio in Workspace";
  const voicemails = audioMedia;

  const title = "Voicemails";

  return (
    <WorkspaceResourceListShell
      title={title}
      error={error}
      isEmpty={isWorkspaceAudioEmpty}
      emptyMessage="Add a voicemail greeting to this workspace."
    >
      {voicemails != null && !isWorkspaceAudioEmpty ? (
        <DataTable
          className="font-semibold text-foreground"
          columns={mediaColumns}
          data={voicemails}
        />
      ) : null}
    </WorkspaceResourceListShell>
  );
}
