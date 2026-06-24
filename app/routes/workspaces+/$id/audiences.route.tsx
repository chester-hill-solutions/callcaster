export { loader } from "./audiences.loader.server";

import { Link, Outlet, useLoaderData, useOutlet, useOutletContext } from "react-router";
import { DataTable } from "@/components/workspace/tables/DataTable";
import { audienceColumns } from "@/components/workspace/tables/columns";
import { Button } from "@/components/ui/button";

import type { ContextType } from "@/lib/types";

export default function WorkspaceAudiencesPage() {
  const outlet = useOutlet();
  const parentContext = useOutletContext<ContextType>();
  const loaderData = useLoaderData();
  const audienceData = "audienceData" in loaderData ? loaderData.audienceData : [];
  const workspace = "workspace" in loaderData ? loaderData.workspace : null;
  const error = "error" in loaderData ? loaderData.error : null;

  const isWorkspaceAudienceEmpty = !audienceData?.length;

  if (outlet) {
    return <Outlet context={parentContext} />;
  }

  return (
    <main className="flex h-full flex-col gap-4 rounded-sm ">
      <div className="flex flex-col sm:flex-row sm:justify-between">
        <div className="flex">
          <h1 className="mb-4 text-center font-Zilla-Slab text-2xl font-bold text-brand-primary dark:text-white">
            {workspace != null
              ? `${workspace?.name} Audiences`
              : "No Workspace"}
          </h1>
        </div>
        <Button asChild className="font-Zilla-Slab text-lg font-semibold">
          <Link to={`./new`}>Add Audience</Link>
        </Button>
      </div>
      {error && !isWorkspaceAudienceEmpty && (
        <h4 className="text-center font-Zilla-Slab text-4xl font-bold text-red-500">
          {error}
        </h4>
      )}

      {!isWorkspaceAudienceEmpty ? (
        <DataTable
          className="rounded-md border-2 font-semibold text-gray-700 dark:border-white dark:text-white"
          columns={audienceColumns}
          data={audienceData}
        />
      ) : (
        <h4 className="py-16 text-center font-Zilla-Slab text-2xl font-bold text-black dark:text-white">
          Add An Audience To This Workspace
        </h4>
      )}
    </main>
  );
}
