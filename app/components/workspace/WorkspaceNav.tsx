import React, { useState } from "react";
import { NavLink, useLocation } from "react-router";
import {
  BarChart3,
  Archive,
  CalendarDays,
  ClipboardList,
  ContactRound,
  CreditCard,
  FileText,
  Headset,
  Megaphone,
  MessageSquare,
  Menu,
  Phone,
  Plus,
  Settings,
  List,
  Upload,
  Users,
  AudioLines,
  Voicemail,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetBody,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useUnreadConversationsCount } from "@/hooks/chats/useUnreadConversationsCount";
import { hasMinRole, MemberRole } from "@/lib/member-role";
import { workspaceSidebarHeightClass } from "./workspace-panel-classes";

function formatUnreadBadgeCount(count: number): string {
  return count > 99 ? "99+" : String(count);
}

function formatCollapsedCreditCount(count: number): string {
  const absoluteCount = Math.abs(count);
  if (absoluteCount >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  }
  if (absoluteCount >= 1_000) {
    return `${(count / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  }
  return String(count);
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
    icon: React.ComponentType<{ className?: string }>;
  }>;
}

interface NavGroup {
  name: string;
  items: NavItem[];
}

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
            icon: Plus,
          },
          { name: "Archived Campaigns", path: "campaigns/archive", icon: Archive },
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
          { name: "Call lists", path: "audiences", icon: List },
          { name: "Contacts", path: "contacts", icon: ContactRound },
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
      {
        name: "Phone Numbers",
        path: "phone-numbers",
        minRole: MemberRole.Member,
        icon: Phone,
      },
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
  userRole: MemberRole;
  className?: string;
}

const WorkspaceNav = ({
  workspace,
  userRole,
  className = "",
}: WorkspaceNavProps) => {
  const location = useLocation();
  const [isCollapsed, setIsCollapsed] = useState(true);
  const unreadChatsCount = useUnreadConversationsCount(workspace.id);
  const isAdmin = hasMinRole(userRole, MemberRole.Admin);
  const baseUrl = `/workspaces/${workspace.id}`;
  const visibleGroups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => hasMinRole(userRole, item.minRole)),
  })).filter((group) => group.items.length > 0);

  const desktopLabelClass = isCollapsed ? "lg:sr-only" : "";
  const desktopCenterClass = "";
  const utilityCollapsedClass = isCollapsed
    ? "lg:justify-center lg:gap-0"
    : "";
  const primaryLinkClass = ({ isActive }: { isActive: boolean }) =>
    `group flex h-auto items-center gap-3 rounded-lg border px-3 py-2 font-Zilla-Slab text-base font-semibold transition-colors lg:h-9 lg:text-sm ${desktopCenterClass} ${
      isActive
        ? "border-brand-primary bg-brand-primary/10 text-brand-primary dark:border-brand-secondary dark:bg-brand-secondary/20 dark:text-brand-secondary"
        : "border-transparent text-foreground/85 hover:border-border hover:bg-muted"
    }`;

  const utilityLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex h-auto items-center justify-between rounded-lg px-3 py-1 font-Zilla-Slab text-sm font-semibold transition-colors lg:h-9 ${desktopCenterClass} ${utilityCollapsedClass} ${
      isActive
        ? "bg-secondary text-secondary-foreground"
        : "text-muted-foreground hover:bg-muted hover:text-foreground"
    }`;

  const subLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex h-auto items-center justify-between gap-2 rounded-md px-3 py-2 font-Zilla-Slab text-sm font-semibold transition-colors lg:h-9 ${desktopCenterClass} ${
      isActive
        ? "bg-brand-primary/10 text-brand-primary dark:bg-brand-secondary/20 dark:text-brand-secondary"
        : "text-muted-foreground hover:bg-muted hover:text-foreground"
    }`;

  const isPeopleParentActive =
    location.pathname === `${baseUrl}/audiences` ||
    location.pathname.startsWith(`${baseUrl}/audiences/`) ||
    location.pathname === `${baseUrl}/contacts` ||
    location.pathname.startsWith(`${baseUrl}/contacts/`);

  const navBody = (
    <>
      <div className="flex min-h-0 flex-1 flex-col justify-between gap-0 px-3 py-4">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full justify-start"
          aria-label={
            isCollapsed ? "Expand workspace sidebar" : "Collapse workspace sidebar"
          }
          aria-expanded={!isCollapsed}
          title={isCollapsed ? "Expand workspace sidebar" : "Collapse workspace sidebar"}
          onClick={() => setIsCollapsed((collapsed) => !collapsed)}
        >
          <Menu className="h-5 w-5 lg:h-4 lg:w-4" aria-hidden="true" />
          <span className={desktopLabelClass}>Workspace menu</span>
        </Button>
        <nav
          aria-label="Workspace sections"
          className="-mx-3 min-h-0 flex-1 overflow-y-auto px-3"
        >
          {visibleGroups.map((group) => (
            <section key={group.name} aria-label={group.name}>
              {group.name !== "Work" ? (
                <h3
                  className={`flex h-9 items-center px-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground ${
                    isCollapsed ? "lg:invisible" : ""
                  }`}
                >
                  {group.name}
                </h3>
              ) : null}
              <div className="space-y-1">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const itemTo = `${baseUrl}${item.path ? `/${item.path}` : ""}`;
                  const isPeopleItem = item.name === "People";
                  const showSubNav = isPeopleItem;
                  const visibleStaticSubItems = (item.subItems ?? []).filter(
                    (subItem) => hasMinRole(userRole, subItem.minRole),
                  );

                  return (
                    <div
                      key={item.name}
                      className={`space-y-1 ${isPeopleItem ? "lg:group/people lg:relative" : ""}`}
                    >
                      <NavLink
                        to={itemTo}
                        className={(navState) =>
                          primaryLinkClass({
                            isActive: isPeopleItem
                                ? isPeopleParentActive
                              : navState.isActive,
                          })
                        }
                        end={item.end}
                        title={item.name}
                      >
                        <Icon className="h-5 w-5 shrink-0 lg:h-4 lg:w-4" />
                        <span className={desktopLabelClass}>{item.name}</span>
                        {item.path === "chats" && unreadChatsCount > 0 ? (
                          <span
                            data-testid="chats-unread-badge"
                            className={`ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground ${isCollapsed ? "lg:hidden" : ""}`}
                          >
                            {formatUnreadBadgeCount(unreadChatsCount)}
                          </span>
                        ) : null}
                      </NavLink>
                      {visibleStaticSubItems.length > 0 && showSubNav ? (
                        <div className="ml-4 space-y-1 border-l border-border/70 pl-3 lg:absolute lg:left-full lg:top-0 lg:z-50 lg:ml-2 lg:hidden lg:w-48 lg:rounded-lg lg:border lg:bg-card lg:p-2 lg:shadow-lg lg:group-hover/people:block lg:group-focus-within/people:block">
                          {visibleStaticSubItems.map((subItem) => {
                            const subItemTo = subItem.path
                              ? `${baseUrl}/${subItem.path}`
                              : baseUrl;
                            return (
                              <NavLink
                                key={subItem.path || subItem.name}
                                to={subItemTo}
                                className={subLinkClass}
                                title={subItem.name}
                              >
                                <subItem.icon className="h-4 w-4 shrink-0" />
                                <span
                                  className={`min-w-0 truncate ${isCollapsed ? "lg:not-sr-only" : ""}`}
                                >
                                  {subItem.name}
                                </span>
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
          <div className="relative z-10 mt-1 shrink-0 border-0 bg-brand-secondary/40 p-0 after:pointer-events-none after:absolute after:-bottom-3 after:left-0 after:h-3 after:w-full after:bg-brand-secondary/40 lg:-mx-3 lg:-mb-4 lg:w-auto lg:pb-1">
            <NavLink
              to={`${baseUrl}/billing`}
              className={utilityLinkClass}
              aria-label={`Credits: ${workspace.credits}`}
              title={`Credits: ${workspace.credits}`}
            >
              <span className="inline-flex items-center gap-2">
                <CreditCard className="h-5 w-5 shrink-0" aria-hidden="true" />
                <span className={desktopLabelClass}>Credits</span>
                <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-md px-1 text-xs font-bold leading-none text-foreground">
                  {isCollapsed ? formatCollapsedCreditCount(workspace.credits) : workspace.credits}
                </span>
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
          className={`hidden ${workspaceSidebarHeightClass} w-full shrink-0 overflow-visible rounded-none border-y-0 border-l-0 border-r border-border/80 bg-card shadow-sm lg:sticky lg:top-0 lg:flex ${isCollapsed ? "lg:w-18 lg:max-w-18" : "lg:w-63 lg:max-w-63"} ${className}`}
      >
        <div className="flex h-full w-full flex-col">{navBody}</div>
      </aside>

      <div className="mb-2 flex items-center justify-between gap-2 lg:hidden">
        <p className="min-w-0 font-Zilla-Slab text-sm font-semibold text-muted-foreground">
          Workspace navigation
        </p>
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
            <SheetBody
              inset="none"
              className="bg-background flex h-full flex-col"
            >
              {navBody}
            </SheetBody>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
};

export default WorkspaceNav;
