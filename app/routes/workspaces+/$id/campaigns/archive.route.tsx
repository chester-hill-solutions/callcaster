export { loader } from "./archive.loader.server";

import { data as routeData, LoaderFunctionArgs, redirect, useLoaderData, useOutletContext, useFetcher, Link } from "react-router";

import { Campaign } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Heading, Text } from "@/components/ui/typography";
import { hasMinRole, MemberRole } from "@/lib/member-role";

type RestoreActionData = {
  success?: boolean;
  error?: string;
  actionType?: string;
};

// Restores an archived campaign back to draft via the same status-change
// action the campaign settings page uses (settings.action.server.ts "status"
// intent) — there is no separate "unarchive" endpoint, and there shouldn't
// be one; draft is the safe landing spot before the owner reconfigures it.
function RestoreCampaignButton({
  workspaceId,
  campaignId,
}: {
  workspaceId: string;
  campaignId: string | number;
}) {
  const fetcher = useFetcher<RestoreActionData>();
  const isRestoring = fetcher.state !== "idle";
  const restoreFailed = fetcher.state === "idle" && fetcher.data?.success === false;

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="shrink-0"
        disabled={isRestoring}
        onClick={() => {
          fetcher.submit(
            { intent: "status", status: "draft" },
            {
              method: "post",
              action: `/workspaces/${workspaceId}/campaigns/${campaignId}/settings`,
            },
          );
        }}
      >
        {isRestoring ? "Restoring…" : "Restore"}
      </Button>
      {restoreFailed ? (
        <Text variant="muted" className="text-xs text-destructive">
          {fetcher.data?.error || "Could not restore this campaign."}
        </Text>
      ) : null}
    </div>
  );
}

const StatusBadge = ({ status }: { status: string }) => {
  const badgeStyles: Record<string, string> = {
    archived: "bg-muted text-muted-foreground",
    complete: "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-200",
  };

  return (
    <Badge className={`text-xxs mx-2 ${badgeStyles[status] || ""}`}>
      {status ? status.charAt(0).toUpperCase() + status.slice(1) : "Archived"}
    </Badge>
  );
};

export default function ArchivedCampaigns() {
  const { archivedCampaigns } = useLoaderData();
  const { workspace, campaigns, userRole } = useOutletContext<{
    workspace: { id: string };
    campaigns: Campaign[];
    userRole?: string | null;
  }>();
  // "Create your first campaign" is only true when the workspace really has no
  // campaigns in flight; drafts count, they just haven't been archived yet.
  const draftCount = (campaigns ?? []).filter(
    (campaign) => campaign.status === "draft",
  ).length;
  // Restoring goes through the same status-change action as every other
  // campaign status transition, which is gated to Admin+ server-side
  // (settings.action.server.ts). Only render the control for roles that can
  // actually use it, instead of showing a button that always 403s.
  const canRestore = hasMinRole(userRole ?? undefined, MemberRole.Admin);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Heading as="h1" level={2} branded={false}>
            Archived Campaigns
          </Heading>
          <Text variant="muted" className="mt-2">
            View and manage your completed and archived campaigns
          </Text>
        </div>
        <Button asChild variant="outline">
          <Link to={`/workspaces/${workspace.id}/campaigns`}>
            Back to Campaigns
          </Link>
        </Button>
      </div>

      {archivedCampaigns.length === 0 ? (
        <div className="py-12 text-center">
          <Text variant="muted" className="text-lg">
            No archived campaigns found
          </Text>
          {draftCount > 0 ? (
            <>
              <Text variant="muted" className="mt-2">
                {draftCount === 1
                  ? "You have 1 draft campaign that hasn't been archived yet."
                  : `You have ${draftCount} draft campaigns that haven't been archived yet.`}
              </Text>
              <Button asChild className="mt-4">
                <Link to={`/workspaces/${workspace.id}/campaigns`}>
                  View drafts
                </Link>
              </Button>
            </>
          ) : (
            <Button asChild className="mt-4">
              <Link to={`/workspaces/${workspace.id}/campaigns/new`}>
                Create your first campaign
              </Link>
            </Button>
          )}
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {archivedCampaigns.map((campaign: Campaign) => (
            <li
              key={campaign.id}
              className="flex flex-col gap-4 py-4 transition-colors hover:bg-muted/30 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-start gap-2">
                  <p className="line-clamp-2 font-medium">
                    {campaign.title || `Unnamed Campaign ${campaign.id}`}
                  </p>
                  <StatusBadge status={campaign.status || "archived"} />
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  <span>
                    <span className="font-medium text-foreground">Type:</span>{" "}
                    {campaign.type || "N/A"}
                  </span>
                  {campaign.created_at ? (
                    <span>
                      <span className="font-medium text-foreground">Created:</span>{" "}
                      {new Date(campaign.created_at).toLocaleDateString()}
                    </span>
                  ) : null}
                  {campaign.end_date ? (
                    <span>
                      <span className="font-medium text-foreground">Ended:</span>{" "}
                      {new Date(campaign.end_date).toLocaleDateString()}
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="flex shrink-0 items-start gap-2">
                <Button asChild variant="outline" size="sm">
                  <Link to={`/workspaces/${workspace.id}/campaigns/${campaign.id}`}>
                    View Details
                  </Link>
                </Button>
                {canRestore ? (
                  <RestoreCampaignButton
                    workspaceId={workspace.id}
                    campaignId={campaign.id}
                  />
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export { RouteErrorBoundary as ErrorBoundary } from "@/components/shared/RouteErrorBoundary";
