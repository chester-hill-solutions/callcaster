export { loader } from "./analytics.loader.server";

import { Link, useLoaderData } from "react-router";

import { WorkspaceAnalyticsPanel } from "@/components/analytics/WorkspaceAnalyticsPanel";
import { Button } from "@/components/ui/button";
import { Heading } from "@/components/ui/typography";
import { MemberRole } from "@/components/workspace/TeamMember";
import type { WorkspaceAnalyticsLoaderData } from "./analytics.loader.server";

export default function WorkspaceAnalyticsPage() {
  const { userRole, analytics, workspaceUsers, currentUserId, error } =
    useLoaderData<WorkspaceAnalyticsLoaderData>();
  const canFilterUsers = userRole !== MemberRole.Caller;

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <Heading as="h1" level={2} branded={false}>
            Analytics
          </Heading>
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
        <p className="text-center font-Zilla-Slab text-lg font-semibold text-destructive">
          {error}
        </p>
      ) : (
        <WorkspaceAnalyticsPanel
          analytics={analytics}
          workspaceUsers={workspaceUsers}
          canFilterUsers={canFilterUsers}
          currentUserId={currentUserId}
        />
      )}
    </div>
  );
}
