export { loader } from "./analytics.loader.server";

import { Link, useLoaderData } from "react-router";

import { WorkspaceAnalyticsPanel } from "@/components/analytics/WorkspaceAnalyticsPanel";
import WorkspaceNav from "@/components/workspace/WorkspaceNav";
import { workspacePanelHeightLgClass } from "@/components/workspace/workspace-panel-classes";
import { Button } from "@/components/ui/button";
import { MemberRole } from "@/components/workspace/TeamMember";
import type { WorkspaceAnalyticsLoaderData } from "./analytics.loader.server";

export default function WorkspaceAnalyticsPage() {
  const { workspace, userRole, campaigns, analytics, workspaceUsers, currentUserId, error } =
    useLoaderData<WorkspaceAnalyticsLoaderData>();
  const canFilterUsers = userRole !== MemberRole.Caller;

  return (
    <main className="mx-auto flex h-full w-full max-w-[1500px] flex-col gap-4 px-4 py-6 sm:px-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch">
        {workspace && userRole ? (
          <WorkspaceNav
            workspace={workspace}
            campaigns={campaigns}
            userRole={userRole as MemberRole}
          />
        ) : null}
        <div
          className={`min-w-0 flex-1 rounded-2xl border border-border/80 bg-card/70 p-4 shadow-sm sm:p-6 ${workspacePanelHeightLgClass} lg:overflow-y-auto`}
        >
          <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <h1 className="font-Zilla-Slab text-3xl font-bold text-brand-primary">
                {workspace ? `${workspace.name} Analytics` : "Analytics"}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Caller performance from outreach attempts and call records in the selected date
                range.
              </p>
            </div>
            <Button asChild variant="outline" className="font-Zilla-Slab text-base font-semibold">
              <Link to=".." relative="path">
                Back
              </Link>
            </Button>
          </div>

          {error ? (
            <p className="mt-6 text-center font-Zilla-Slab text-lg font-semibold text-red-500">
              {error}
            </p>
          ) : (
            <div className="mt-6">
              <WorkspaceAnalyticsPanel
                analytics={analytics}
                workspaceUsers={workspaceUsers}
                canFilterUsers={canFilterUsers}
                currentUserId={currentUserId}
              />
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
