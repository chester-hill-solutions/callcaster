import React from "react";
import { NavLink } from "@remix-run/react";
import {
  MdCampaign,
  MdChat,
  MdCreditCard,
  MdGraphicEq,
  MdHeadsetMic,
  MdPeople,
  MdSettings,
  MdTextSnippet,
  MdUploadFile,
} from "react-icons/md";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { MemberRole } from "./TeamMember";

interface NavItem {
  name: string;
  path: string;
  end?: boolean;
  callerHidden?: boolean;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV_ITEMS: NavItem[] = [
  { name: "Campaigns", path: "", end: true, icon: MdCampaign },
  { name: "Chats", path: "chats", icon: MdChat },
  { name: "Handset", path: "handset", icon: MdHeadsetMic },
  { name: "Scripts", path: "scripts", callerHidden: true, icon: MdTextSnippet },
  { name: "Audio", path: "audios", callerHidden: true, icon: MdGraphicEq },
  { name: "Audiences", path: "audiences", callerHidden: true, icon: MdPeople },
  { name: "Exports", path: "exports", callerHidden: true, icon: MdUploadFile },
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
  const userIsCaller = userRole === MemberRole.Caller;
  const isAdmin =
    userRole === MemberRole.Admin || userRole === MemberRole.Owner;
  const baseUrl = `/workspaces/${workspace.id}`;
  const filteredItems = NAV_ITEMS.filter(
    (item) => !userIsCaller || !item.callerHidden,
  );

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

  const navBody = (
    <>
      <div className="border-b border-border/60 px-4 py-4">
        <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
          Workspace
        </p>
        <h2 className="mt-1 truncate font-Tabac-Slab text-2xl font-black text-brand-primary dark:text-brand-secondary">
          {workspace.name}
        </h2>
      </div>

      <div className="flex flex-1 flex-col justify-between gap-6 px-3 py-4">
        <nav className="space-y-1">
          {filteredItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.name}
                to={`${baseUrl}${item.path ? `/${item.path}` : ""}`}
                className={primaryLinkClass}
                end={item.end}
              >
                <Icon className="h-5 w-5" />
                <span>{item.name}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="rounded-lg border border-border/80 bg-card/70 p-2">
          <NavLink to={`${baseUrl}/settings`} className={utilityLinkClass} end>
            <span className="inline-flex items-center gap-2">
              <MdSettings className="h-4 w-4" />
              Settings
            </span>
          </NavLink>
          {isAdmin ? (
            <NavLink to={`${baseUrl}/billing`} className={utilityLinkClass}>
              <span className="inline-flex items-center gap-2">
                <MdCreditCard className="h-4 w-4" />
                Credits
              </span>
              <span className="rounded-md bg-brand-secondary/40 px-2 py-0.5 text-xs text-foreground">
                {workspace.credits}
              </span>
            </NavLink>
          ) : null}
        </div>
      </div>
    </>
  );

  return (
    <>
      <aside
        className={`hidden h-[calc(100vh-112px)] min-h-[560px] w-full max-w-[252px] shrink-0 overflow-hidden rounded-2xl border border-border/80 bg-gradient-to-b from-card via-card to-brand-secondary/10 shadow-sm lg:sticky lg:top-6 lg:flex ${className}`}
      >
        <div className="flex h-full w-full flex-col">{navBody}</div>
      </aside>

      <div className="mb-2 flex items-center justify-between gap-2 lg:hidden">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
            Workspace
          </p>
          <h2 className="truncate font-Tabac-Slab text-2xl font-black text-brand-primary dark:text-brand-secondary">
            {workspace.name}
          </h2>
        </div>
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" className="font-Zilla-Slab font-semibold">
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
