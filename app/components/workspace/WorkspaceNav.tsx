import React from "react";
import { NavLink, useLocation } from "react-router";
import {
  BarChart3,
  CalendarDays,
  ClipboardList,
  CreditCard,
  FileText,
  Headset,
  Megaphone,
  MessageSquare,
  Phone,
  Settings,
  Upload,
  Users,
  AudioLines,
  Voicemail,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useUnreadConversationsCount } from "@/hooks/chats/useUnreadConversationsCount";
import {
  CampaignQueueProgress,
  type CampaignQueueProgressCounts,
} from "@/components/campaign/CampaignQueueProgress";
import { hasMinRole, MemberRole } from "@/lib/member-role";
import { workspaceSidebarHeightClass } from "./workspace-panel-classes";

function formatUnreadBadgeCount(count: number): string {
  return count > 99 ? "99+" : String(count);
}

interface NavItem {
  name: string;
  path: string;
  end?: boolean;
  minRole?: MemberRole;
  icon: React.ComponentType<{ className?: string }>;
  subItems?: Array<{
    name: string;
    path: string;
    minRole?: MemberRole;
  }>;
}

interface NavGroup {
  name: string;
  items: NavItem[];
}

type CampaignNavSubItem = {
  name: string;
  path: string;
  status?: string | null;
  campaignId?: string | number;
};

const NAV_GROUPS: NavGroup[] = [
  {
    name: "Work",
    items: [
      { name: "Today", path: "", end: true, icon: CalendarDays },
      {
        name: "Campaigns",
        path: "campaigns",
        icon: Megaphone,
        subItems: [
          {
            name: "New Campaign",
            path: "campaigns/new",
            minRole: MemberRole.Admin,
          },
          { name: "Archived Campaigns", path: "campaigns/archive" },
        ],
      },
      { name: "Messages", path: "chats", icon: MessageSquare },
      { name: "Call History", path: "calls", icon: Phone },
      { name: "Voicemails", path: "voicemails", icon: Voicemail },
      { name: "Handset", path: "handset", icon: Headset },
    ],
  },
  {
    name: "Prepare",
    items: [
      {
        name: "Scripts",
        path: "scripts",
        minRole: MemberRole.Member,
        icon: FileText,
      },
      {
        name: "Surveys",
        path: "surveys",
        minRole: MemberRole.Member,
        icon: ClipboardList,
      },
      {
        name: "Audio",
        path: "audios",
        minRole: MemberRole.Member,
        icon: AudioLines,
      },
      {
        name: "People",
        path: "audiences",
        minRole: MemberRole.Member,
        icon: Users,
        subItems: [
          { name: "Call lists", path: "audiences" },
          { name: "Contacts", path: "contacts" },
        ],
      },
    ],
  },
  {
    name: "Review",
    items: [
      { name: "Analytics", path: "analytics", icon: BarChart3 },
      {
        name: "Exports",
        path: "exports",
        minRole: MemberRole.Member,
        icon: Upload,
      },
    ],
  },
  {
    name: "Setup",
    items: [
      { name: "Settings", path: "settings", icon: Settings },
    ],
  },
];

interface WorkspaceNavProps {
  workspace: {
    id: string;
    name: string;
    credits: number;
  };
  campaigns: Array<{
    id: string | number;
    title?: string | null;
    status?: string | null;
  }>;
  campaignQueueProgress?: Record<string, CampaignQueueProgressCounts>;
  userRole: MemberRole;
  className?: string;
}

const WorkspaceNav = ({
  workspace,
  campaigns,
  campaignQueueProgress = {},
  userRole,
  className = "",
}: WorkspaceNavProps) => {
  const location = useLocation();
  const unreadChatsCount = useUnreadConversationsCount(workspace.id);
  const isAdmin = hasMinRole(userRole, MemberRole.Admin);
  const baseUrl = `/workspaces/${workspace.id}`;
  const visibleGroups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => hasMinRole(userRole, item.minRole)),
  })).filter((group) => group.items.length > 0);

  const primaryLinkClass = ({ isActive }: { isActive: boolean }) =>
    `group flex items-center gap-3 rounded-lg border px-3 py-2 font-Zilla-Slab text-base font-semibold transition-colors ${
      isActive
        ? "border-brand-primary bg-brand-primary/10 text-brand-primary dark:border-brand-secondary dark:bg-brand-secondary/20 dark:text-brand-secondary"
        : "border-transparent text-foreground/85 hover:border-border hover:bg-muted"
    }`;

  const utilityLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center justify-between rounded-lg px-3 py-2 font-Zilla-Slab text-sm font-semibold transition-colors ${
      isActive
        ? "bg-secondary text-secondary-foreground"
        : "text-muted-foreground hover:bg-muted hover:text-foreground"
    }`;

  const subLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center justify-between gap-2 rounded-md px-3 py-2 font-Zilla-Slab text-sm font-semibold transition-colors ${
      isActive
        ? "bg-brand-primary/10 text-brand-primary dark:bg-brand-secondary/20 dark:text-brand-secondary"
        : "text-muted-foreground hover:bg-muted hover:text-foreground"
    }`;

  const campaignStatusClass = (status: string) => {
    switch (status) {
      case "active":
      case "running":
      case "in_progress":
        return "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300";
      case "scheduled":
      case "queued":
        return "bg-amber-500/20 text-amber-700 dark:text-amber-300";
      case "complete":
      case "completed":
      case "archived":
        return "bg-slate-500/20 text-slate-700 dark:text-slate-300";
      case "failed":
      case "error":
        return "bg-red-500/20 text-red-700 dark:text-red-300";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const formatCampaignStatus = (status: string) => {
    const normalized = status.replaceAll("_", " ").trim();
    if (normalized.length === 0) return "Unknown";
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
  };

  const isCampaignsParentActive =
    location.pathname === `${baseUrl}/campaigns` ||
    location.pathname.startsWith(`${baseUrl}/campaigns/`);
  const isPeopleParentActive =
    location.pathname === `${baseUrl}/audiences` ||
    location.pathname.startsWith(`${baseUrl}/audiences/`) ||
    location.pathname === `${baseUrl}/contacts` ||
    location.pathname.startsWith(`${baseUrl}/contacts/`);

  const navBody = (
    <>
      {/* px-6 = body px-3 + item px-3, so this text lines up with nav item text. */}
      <div className="border-b border-border/60 px-6 py-4">
        <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
          Workspace
        </p>
        <h2 className="mt-1 truncate font-Tabac-Slab text-xl font-black text-brand-primary dark:text-brand-secondary">
          {workspace.name}
        </h2>
      </div>

      <div className="flex min-h-0 flex-1 flex-col justify-between gap-4 px-3 py-4">
        <nav
          aria-label="Workspace sections"
          className="min-h-0 space-y-5 overflow-y-auto pr-1"
        >
          {visibleGroups.map((group) => (
            <section key={group.name} aria-label={group.name}>
              <h3 className="mb-1 px-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                {group.name}
              </h3>
              <div className="space-y-1">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const itemTo = `${baseUrl}${item.path ? `/${item.path}` : ""}`;
                  const isCampaignsItem = item.path === "campaigns";
                  const isPeopleItem = item.name === "People";
                  const showCampaignSubNav =
                    isCampaignsItem && isCampaignsParentActive;
                  const showSubNav =
                    showCampaignSubNav || isPeopleItem;
                  const visibleStaticSubItems = (item.subItems ?? []).filter(
                    (subItem) => hasMinRole(userRole, subItem.minRole),
                  );
                  const campaignSubItems: CampaignNavSubItem[] =
                    isCampaignsItem
                      ? [
                          ...visibleStaticSubItems,
                          // Archived campaigns live in the dedicated Archive
                          // view; keep them out of the everyday nav (#1072).
                          ...campaigns
                            .filter((campaign) => campaign.status !== "archived")
                            .map((campaign) => ({
                            name:
                              campaign.title?.trim() ||
                              `Campaign ${String(campaign.id)}`,
                            path: `campaigns/${campaign.id}`,
                            status: campaign.status,
                            campaignId: campaign.id,
                          })),
                        ]
                      : visibleStaticSubItems;

                  return (
                    <div key={item.name} className="space-y-1">
                      <NavLink
                        to={itemTo}
                        className={(navState) =>
                          primaryLinkClass({
                            isActive: isCampaignsItem
                              ? isCampaignsParentActive
                              : isPeopleItem
                                ? isPeopleParentActive
                              : navState.isActive,
                          })
                        }
                        end={item.end}
                      >
                        <Icon className="h-5 w-5" />
                        <span>{item.name}</span>
                        {item.path === "chats" && unreadChatsCount > 0 ? (
                          <span
                            data-testid="chats-unread-badge"
                            className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground"
                          >
                            {formatUnreadBadgeCount(unreadChatsCount)}
                          </span>
                        ) : null}
                      </NavLink>
                      {campaignSubItems.length > 0 && showSubNav ? (
                        <div className="ml-4 space-y-1 border-l border-border/70 pl-3">
                          {campaignSubItems.map((subItem) => {
                            const subItemTo = subItem.path
                              ? `${baseUrl}/${subItem.path}`
                              : baseUrl;
                            const progress =
                              subItem.campaignId != null
                                ? campaignQueueProgress[String(subItem.campaignId)]
                                : undefined;
                            return (
                              <NavLink
                                key={subItem.path || subItem.name}
                                to={subItemTo}
                                className={subLinkClass}
                              >
                                <span className="min-w-0 truncate">
                                  {subItem.name}
                                </span>
                                {progress?.totalCount || subItem.status ? (
                                  <span className="flex shrink-0 items-center gap-1.5">
                                    {progress?.totalCount ? (
                                      <CampaignQueueProgress
                                        completedCount={progress.completedCount}
                                        totalCount={progress.totalCount}
                                        className="text-[10px] font-semibold uppercase tracking-wide"
                                      />
                                    ) : null}
                                    {subItem.status ? (
                                      <span
                                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${campaignStatusClass(
                                          subItem.status,
                                        )}`}
                                      >
                                        {formatCampaignStatus(subItem.status)}
                                      </span>
                                    ) : null}
                                  </span>
                                ) : null}
                              </NavLink>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </nav>

        {isAdmin ? (
          <div className="shrink-0 rounded-lg border border-border/80 bg-card/70 p-2">
            <NavLink to={`${baseUrl}/billing`} className={utilityLinkClass}>
              <span className="inline-flex items-center gap-2">
                <CreditCard className="h-4 w-4" />
                Credits
              </span>
              <span className="rounded-md bg-brand-secondary/40 px-2 py-0.5 text-xs text-foreground">
                {workspace.credits}
              </span>
            </NavLink>
          </div>
        ) : null}
      </div>
    </>
  );

  return (
    <>
      <aside
        className={`hidden ${workspaceSidebarHeightClass} w-full max-w-[252px] shrink-0 overflow-hidden rounded-2xl border border-border/80 bg-gradient-to-b from-card via-card to-brand-secondary/10 shadow-sm lg:sticky lg:top-6 lg:flex ${className}`}
      >
        <div className="flex h-full w-full flex-col">{navBody}</div>
      </aside>

      <div className="mb-2 flex items-center justify-between gap-2 lg:hidden">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
            Workspace
          </p>
          <h2 className="line-clamp-2 break-words font-Tabac-Slab text-2xl font-black text-brand-primary dark:text-brand-secondary">
            {workspace.name}
          </h2>
        </div>
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm" className="font-Zilla-Slab font-semibold">
              Browse Workspace
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0">
            <SheetHeader className="sr-only">
              <SheetTitle>Workspace navigation</SheetTitle>
              <SheetDescription>
                Navigate workspace sections and utilities.
              </SheetDescription>
            </SheetHeader>
            <div className="flex h-full flex-col bg-background">{navBody}</div>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
};

export default WorkspaceNav;
