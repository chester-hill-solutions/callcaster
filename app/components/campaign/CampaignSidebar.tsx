import { useEffect } from "react";
import { NavLink, useFetcher, useRevalidator } from "react-router";
import { Pause, Play } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  CampaignQueueProgress,
  type CampaignQueueProgressCounts,
} from "@/components/campaign/CampaignQueueProgress";
import { hasMinRole, MemberRole } from "@/lib/member-role";
import { sortCampaignsForList } from "@/lib/campaign-list-order";
import type { Campaign } from "@/lib/types";
import { cn } from "@/lib/utils";

type CampaignSidebarActionData = {
  success?: boolean;
  error?: string;
  actionType?: string;
  status?: string;
};

type CampaignSidebarProps = {
  workspaceId: string;
  campaigns: Campaign[];
  campaignQueueProgress?: Record<string, CampaignQueueProgressCounts>;
  userRole: MemberRole;
  className?: string;
};

const ACTIVE_CAMPAIGNS = new Set(["running", "waiting"]);

function campaignName(campaign: Campaign): string {
  return campaign.title?.trim() || `Campaign ${String(campaign.id)}`;
}

function getQuickAction(status: string | null | undefined):
  | { label: "Pause" | "Resume"; nextStatus: "paused" | "running"; icon: typeof Pause }
  | null {
  if (status === "paused") {
    return { label: "Resume", nextStatus: "running", icon: Play };
  }
  if (status && ACTIVE_CAMPAIGNS.has(status)) {
    return { label: "Pause", nextStatus: "paused", icon: Pause };
  }
  return null;
}

function CampaignSidebarList({
  workspaceId,
  campaigns,
  campaignQueueProgress,
  userRole,
  onNavigate,
}: CampaignSidebarProps & { onNavigate?: () => void }) {
  const revalidator = useRevalidator();
  const fetcher = useFetcher<CampaignSidebarActionData>();
  const canManageCampaigns = hasMinRole(userRole, MemberRole.Admin);
  const visibleCampaigns = sortCampaignsForList(
    campaigns.filter((campaign) => campaign.status !== "archived"),
  );
  const busyCampaignId = fetcher.formData?.get("campaignId")?.toString();

  /**
   * @effect Show the server result and refresh the workspace campaign data after
   * a quick status action completes.
   * @effect-deps fetcher.data, fetcher.state, revalidator
   * @effect-side-effects toast notification + route revalidation
   * @effect-why-not-loader The result belongs to a client-side fetcher submit.
   */
  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;

    if (fetcher.data.success) {
      toast.success("Campaign status updated.");
      revalidator.revalidate();
    } else if (fetcher.data.error) {
      toast.error(fetcher.data.error);
    }
  }, [fetcher.data, fetcher.state, revalidator]);

  const submitStatus = (campaign: Campaign, status: "paused" | "running") => {
    fetcher.submit(
      { intent: "status", status, campaignId: String(campaign.id) },
      {
        method: "post",
        action: `/workspaces/${workspaceId}/campaigns/${campaign.id}/settings`,
      },
    );
  };

  return (
    <nav aria-label="Campaigns" className="min-h-0 flex-1 overflow-y-auto">
      {visibleCampaigns.length > 0 ? (
        <div className="space-y-1">
          {visibleCampaigns.map((campaign) => {
            const name = campaignName(campaign);
            const progress = campaignQueueProgress?.[String(campaign.id)];
            const quickAction = canManageCampaigns
              ? getQuickAction(campaign.status)
              : null;
            const isBusy = busyCampaignId === String(campaign.id);

            return (
              <div
                key={campaign.id}
                className="flex items-center gap-1 rounded-lg border border-transparent p-1 hover:border-border hover:bg-muted/60"
              >
                <NavLink
                  to={`/workspaces/${workspaceId}/campaigns/${campaign.id}`}
                  onClick={onNavigate}
                  className={({ isActive, isPending }) =>
                    cn(
                      "min-w-0 flex-1 rounded-md px-2 py-2 font-Zilla-Slab transition-colors",
                      isActive
                        ? "bg-brand-primary/10 text-brand-primary dark:bg-brand-secondary/20 dark:text-brand-secondary"
                        : isPending
                          ? "bg-muted text-foreground"
                          : "text-foreground/85 hover:text-foreground",
                    )
                  }
                >
                  <span className="block truncate text-sm font-semibold">
                    {name}
                  </span>
                  <span className="mt-1 flex min-w-0 items-center gap-2">
                    {campaign.status ? (
                      <StatusBadge status={campaign.status} className="text-[10px]" />
                    ) : null}
                    {progress?.totalCount ? (
                      <CampaignQueueProgress
                        completedCount={progress.completedCount}
                        totalCount={progress.totalCount}
                        className="text-[10px]"
                      />
                    ) : null}
                  </span>
                </NavLink>
                {quickAction ? (
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 shrink-0"
                    disabled={isBusy}
                    aria-label={`${quickAction.label} ${name}`}
                    title={`${quickAction.label} ${name}`}
                    onClick={() => submitStatus(campaign, quickAction.nextStatus)}
                  >
                    <quickAction.icon className="h-4 w-4" aria-hidden="true" />
                  </Button>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="px-2 py-3 text-sm text-muted-foreground">
          No active campaigns.
        </p>
      )}
    </nav>
  );
}

export default function CampaignSidebar({
  workspaceId,
  campaigns,
  campaignQueueProgress = {},
  userRole,
  className = "",
}: CampaignSidebarProps) {
  const canManageCampaigns = hasMinRole(userRole, MemberRole.Admin);
  const bodyProps = {
    workspaceId,
    campaigns,
    campaignQueueProgress,
    userRole,
  };

  return (
    <>
      <aside
        aria-label="Campaign navigation"
        className={cn(
          "hidden h-full w-full max-w-[280px] shrink-0 overflow-hidden border-r border-border/70 bg-card/40 lg:sticky lg:top-0 lg:flex",
          className,
        )}
      >
        <div className="flex h-full w-full flex-col px-3 py-4">
          <div className="mb-3 flex items-center justify-between gap-2 px-2">
            <h2 className="font-Zilla-Slab text-sm font-bold text-foreground">
              Campaigns
            </h2>
            {canManageCampaigns ? (
              <NavLink
                to={`/workspaces/${workspaceId}/campaigns/new`}
                className="text-xs font-semibold text-primary underline-offset-4 hover:underline"
              >
                New
              </NavLink>
            ) : null}
          </div>
          <CampaignSidebarList {...bodyProps} />
        </div>
      </aside>

      <div className="mb-3 lg:hidden">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm" className="font-Zilla-Slab font-semibold">
              Browse campaigns
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0">
            <SheetHeader className="sr-only">
              <SheetTitle>Campaign navigation</SheetTitle>
              <SheetDescription>
                Browse campaigns and view their status and progress.
              </SheetDescription>
            </SheetHeader>
            <SheetBody inset="none" className="flex h-full flex-col bg-background">
              <div className="flex h-full flex-col p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h2 className="font-Zilla-Slab text-lg font-bold text-foreground">
                    Campaigns
                  </h2>
                  {canManageCampaigns ? (
                    <NavLink
                      to={`/workspaces/${workspaceId}/campaigns/new`}
                      className="text-sm font-semibold text-primary underline-offset-4 hover:underline"
                    >
                      New
                    </NavLink>
                  ) : null}
                </div>
                <CampaignSidebarList
                  {...bodyProps}
                  onNavigate={() => undefined}
                />
              </div>
            </SheetBody>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
