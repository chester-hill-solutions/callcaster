export { loader } from "./audiences.loader.server";

import { Link, Outlet, useLoaderData, useOutlet, useOutletContext } from "react-router";
import type { MetaFunction } from "react-router";
import { DataTable } from "@/components/workspace/tables/DataTable";
import { audienceColumns } from "@/components/workspace/tables/columns";
import { WorkspaceResourceListShell } from "@/components/workspace/WorkspaceResourceListShell";
import { Button } from "@/components/ui/button";

import type { ContextType } from "@/lib/types";

export const meta: MetaFunction = () => [{ title: "Audiences — CallCaster" }];

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

  const title = "Audiences";

  return (
    <WorkspaceResourceListShell
      title={title}
      error={error}
      isEmpty={isWorkspaceAudienceEmpty}
      emptyMessage="Add An Audience To This Workspace"
      emptyDescription="Audiences are the contact lists your campaigns dial and message. Upload a CSV or build one from your contacts."
      addAction={
        <Button asChild className="font-Zilla-Slab text-lg font-semibold">
          <Link to="./new">Add Audience</Link>
        </Button>
      }
    >
      {!isWorkspaceAudienceEmpty ? (
        <DataTable
          className="font-semibold text-foreground"
          columns={audienceColumns}
          data={audienceData}
        />
      ) : null}
    </WorkspaceResourceListShell>
  );
}

export { RouteErrorBoundary as ErrorBoundary } from "@/components/shared/RouteErrorBoundary";
