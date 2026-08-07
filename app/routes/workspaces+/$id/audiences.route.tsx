export { loader } from "./audiences.loader.server";

import { Link, Outlet, useLoaderData, useOutlet, useOutletContext } from "react-router";
import type { MetaFunction } from "react-router";
import { DataTable } from "@/components/workspace/tables/DataTable";
import { audienceColumns } from "@/components/workspace/tables/columns";
import { WorkspaceResourceListShell } from "@/components/workspace/WorkspaceResourceListShell";
import { Button } from "@/components/ui/button";
import { PeopleHubLayout } from "@/components/people/PeopleHubLayout";

import type { ContextType } from "@/lib/types";

export const meta: MetaFunction = () => [{ title: "Call lists — CallCaster" }];

export default function WorkspaceAudiencesPage() {
  const outlet = useOutlet();
  const parentContext = useOutletContext<ContextType>();
  const loaderData = useLoaderData();
  const audienceData = "audienceData" in loaderData ? loaderData.audienceData : [];
  const workspace = "workspace" in loaderData ? loaderData.workspace : null;
  const error = "error" in loaderData ? loaderData.error : null;

  const isWorkspaceAudienceEmpty = !audienceData?.length;

  if (outlet) {
    return (
      <PeopleHubLayout title="Call lists">
        <Outlet context={parentContext} />
      </PeopleHubLayout>
    );
  }

  const title = "Call lists";

  return (
    <PeopleHubLayout title="Call lists">
      <WorkspaceResourceListShell
        title={title}
        hideTitle
        error={error}
        isEmpty={isWorkspaceAudienceEmpty}
        emptyMessage="Add a Call list to this workspace"
        emptyDescription="Call lists organize the contacts your campaigns dial and message. Upload a CSV or build one from your contacts."
        addAction={
          <Button asChild className="font-Zilla-Slab text-lg font-semibold">
            <Link to="./new">Add Call list</Link>
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
    </PeopleHubLayout>
  );
}

export { RouteErrorBoundary as ErrorBoundary } from "@/components/shared/RouteErrorBoundary";
