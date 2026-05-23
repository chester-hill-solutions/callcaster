export { loader } from "./voicemails.loader.server";

import { LoaderFunctionArgs, redirect, useLoaderData, useOutletContext } from "react-router";
import { mediaColumns } from "@/components/file-assets/columns";

import { DataTable } from "@/components/workspace/tables/DataTable";


import { Workspace } from "@/lib/types";
import type { FileObject } from "@supabase/storage-js";

export default function WorkspaceVoicemailsPage() {
  const { audioMedia, error} =
    useLoaderData();
  const {workspace } = useOutletContext<{workspace: Workspace}>();
  const isWorkspaceAudioEmpty = error === "No Audio in Workspace";
  const voicemails = audioMedia?.filter(
    (media) => media.name.includes("voicemail-+") || media.name.includes("voicemail-undefined"),
  );

  return (
    <main className="flex h-full flex-col gap-4 rounded-sm ">
      <div className="flex flex-col sm:flex-row sm:justify-between">
        <div className="flex">
          <h1 className="mb-4 text-center font-Zilla-Slab text-2xl font-bold text-brand-primary dark:text-white">
            {workspace != null
              ? `${workspace?.name} Voicemails`
              : "No Workspace"}
          </h1>
        </div>
      </div>
      {error && !isWorkspaceAudioEmpty && (
        <h4 className="text-center font-Zilla-Slab text-4xl font-bold text-red-500">
          {error}
        </h4>
      )}
      {isWorkspaceAudioEmpty && (
        <h4 className="py-16 text-center font-Zilla-Slab text-2xl font-bold text-black dark:text-white">
          Add Your Own Audio to this Workspace!
        </h4>
      )}
      {voicemails != null && (
        <DataTable
          className="rounded-md border-2 font-semibold text-gray-700 dark:border-white dark:text-white"
          columns={mediaColumns}
          data={voicemails}
        />
      )}
    </main>
  );
}
