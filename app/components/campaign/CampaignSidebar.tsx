import { useMemo, useState } from "react";
import { NavLink, useFetcher } from "react-router";
import { Headset, Mail, MessageSquare, Pause, Phone, Play, Plus } from "lucide-react";
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
import {
  CampaignQueueProgress,
  type CampaignQueueProgressCounts,
} from "@/components/campaign/CampaignQueueProgress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { hasMinRole, MemberRole } from "@/lib/member-role";
import { useFetcherOnIdle } from "@/hooks/utils";
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

const CAMPAIGN_STATUS_OPTIONS = [
  ["pending", "Pending"],
  ["scheduled", "Scheduled"],
  ["running", "Running"],
  ["complete", "Complete"],
  ["paused", "Paused"],
  ["draft", "Draft"],
  ["archived", "Archived"],
  ["waiting", "Waiting"],
] as const;

const CAMPAIGN_TYPE_OPTIONS = [
  ["message", "SMS"],
  ["ivr", "IVR"],
  ["live_call", "Live calling"],
  ["email", "Email"],
] as const;

const campaignStatusBarClass: Record<string, string> = {
  pending: "border-l-warning-text",
  scheduled: "border-l-info-text",
  running: "border-l-success-text",
  complete: "border-l-success-text",
  paused: "border-l-warning-text",
  draft: "border-l-muted-foreground",
  archived: "border-l-border",
  waiting: "border-l-warning-text",
};

function campaignTypeFilterValue(type: string | null | undefined): string {
  if (type === "simple_ivr" || type === "complex_ivr" || type === "robocall") {
    return "ivr";
  }
  return type ?? "";
}

function CampaignTypeIcon({ type }: { type: string | null | undefined }) {
  const Icon =
    type === "message"
      ? MessageSquare
      : type === "live_call"
        ? Headset
        : type === "email"
          ? Mail
          : Phone;
  return <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />;
}

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
  const fetcher = useFetcher<CampaignSidebarActionData>();
  const canManageCampaigns = hasMinRole(userRole, MemberRole.Admin);
  const busyCampaignId = fetcher.formData?.get("campaignId")?.toString();

  useFetcherOnIdle(fetcher, (data) => {
    if (data?.success) {
      toast.success("Campaign status updated.");
    } else if (data?.error) {
      toast.error(data.error);
    }
  });

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
    <nav aria-label="Campaigns" className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
      {campaigns.length > 0 ? (
        <div className="space-y-1">
          {campaigns.map((campaign) => {
            const name = campaignName(campaign);
            const progress = campaignQueueProgress?.[String(campaign.id)];
            const quickAction = canManageCampaigns
              ? getQuickAction(campaign.status)
              : null;
            const isBusy = busyCampaignId === String(campaign.id);

            return (
              <div
                key={campaign.id}
                className={`flex items-center gap-1 rounded-lg border border-transparent border-l-4 p-1 hover:border-border hover:bg-muted/60 ${campaignStatusBarClass[campaign.status ?? ""] ?? "border-l-border"}`}
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
                  <span className="flex min-w-0 items-center gap-2">
                    <CampaignTypeIcon type={campaign.type} />
                    <span className="block min-w-0 truncate text-sm font-semibold">{name}</span>
                  </span>
                  <span className="mt-1 flex min-w-0 items-center gap-2">
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
  const [isMobileSheetOpen, setIsMobileSheetOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const filteredCampaigns = useMemo(
    () => campaigns.filter((campaign) => {
      const matchesType =
        typeFilter === "all" || campaignTypeFilterValue(campaign.type) === typeFilter;
      const matchesStatus =
        statusFilter === "all" || campaign.status === statusFilter;
      return matchesType && matchesStatus;
    }),
    [campaigns, statusFilter, typeFilter],
  );
  const bodyProps = {
    workspaceId,
    campaigns: filteredCampaigns,
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
        <div className="flex h-full w-full flex-col">
          <div className="mt-4 mb-3 flex items-center gap-2 px-3">
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="h-8 min-w-0 flex-1 px-2 text-xs">
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {CAMPAIGN_TYPE_OPTIONS.map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 min-w-0 flex-1 px-2 text-xs">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {CAMPAIGN_STATUS_OPTIONS.map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {canManageCampaigns ? (
              <NavLink
                to={`/workspaces/${workspaceId}/campaigns/new`}
                aria-label="New campaign"
                title="New campaign"
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-primary hover:bg-muted"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
              </NavLink>
            ) : null}
          </div>
          <CampaignSidebarList {...bodyProps} />
        </div>
      </aside>

      <div className="mb-3 lg:hidden">
        <Sheet open={isMobileSheetOpen} onOpenChange={setIsMobileSheetOpen}>
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
                  <div className="flex min-w-0 flex-1 gap-2">
                    <Select value={typeFilter} onValueChange={setTypeFilter}>
                      <SelectTrigger className="h-8 min-w-0 flex-1 px-2 text-xs">
                        <SelectValue placeholder="All Types" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Types</SelectItem>
                        {CAMPAIGN_TYPE_OPTIONS.map(([value, label]) => (
                          <SelectItem key={value} value={value}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger className="h-8 min-w-0 flex-1 px-2 text-xs">
                        <SelectValue placeholder="All Statuses" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Statuses</SelectItem>
                        {CAMPAIGN_STATUS_OPTIONS.map(([value, label]) => (
                          <SelectItem key={value} value={value}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {canManageCampaigns ? (
                    <NavLink
                      to={`/workspaces/${workspaceId}/campaigns/new`}
                      aria-label="New campaign"
                      title="New campaign"
                      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-primary hover:bg-muted"
                    >
                      <Plus className="h-4 w-4" aria-hidden="true" />
                    </NavLink>
                  ) : null}
                </div>
                {isMobileSheetOpen ? (
                  <CampaignSidebarList
                    {...bodyProps}
                    onNavigate={() => setIsMobileSheetOpen(false)}
                  />
                ) : null}
              </div>
            </SheetBody>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
