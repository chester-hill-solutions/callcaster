import React from "react";
import { NavLink } from "@remix-run/react";
import { FaPlus } from "react-icons/fa";
import { Card, CardHeader } from "@/components/ui/card";
import { MemberRole } from "@/components/workspace/TeamMember";
import { Badge } from "@/components/ui/badge";
import { Campaign } from "@/lib/types";

const handleNavlinkStyles = ({
  isActive,
  isPending,
}: {
  isActive: boolean;
  isPending: boolean;
}) =>
  `flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm font-semibold font-Zilla-Slab transition-colors ${
    isActive
      ? "border-brand-primary bg-brand-primary/10 text-brand-primary dark:border-brand-secondary dark:bg-brand-secondary/20 dark:text-brand-secondary"
      : isPending
        ? "border-border bg-muted"
        : "border-transparent bg-background/60 text-foreground/90 hover:border-border hover:bg-muted"
  }`;

const StatusBadge = ({ status }: { status: string }) => {
  const badgeStyles = {
    pending: "bg-yellow-200 text-yellow-800",
    scheduled: "bg-blue-200 text-blue-800",
    draft: "bg-gray-200 text-gray-800",
    running: "bg-green-200 text-green-800",
    active: "bg-green-200 text-green-800",
    paused: "bg-orange-200 text-orange-800",
    complete: "bg-teal-100 text-teal-800",
  };

  return (
    <Badge
      className={`text-xxs shrink-0 ${badgeStyles[status as keyof typeof badgeStyles] || ""}`}
    >
      {status ? status?.charAt(0)?.toUpperCase() + status?.slice(1) : "ERROR"}
    </Badge>
  );
};

const CampaignsList = ({
  campaigns,
  userRole,
  setCampaignsListOpen,
}: {
  campaigns: (Campaign | undefined)[];
  userRole: MemberRole;
  setCampaignsListOpen: (open: boolean) => void;
}) => (
  <Card className="flex h-full min-h-[440px] flex-auto flex-col overflow-hidden border border-border/80 bg-card/80 shadow-sm">
    <CardHeader className="p-0">
      <NavLink
        to={`campaigns/new`}
        className="flex items-center justify-center gap-2 rounded-none border-b border-border/70 bg-brand-primary px-3 py-3 font-Zilla-Slab text-sm font-bold text-primary-foreground md:rounded-t-lg"
      >
        <span>Add Campaign</span>
        <FaPlus size="16" />
      </NavLink>
    </CardHeader>
    <div className="flex flex-grow flex-col justify-between gap-2 p-2">
      <nav className="flex flex-col gap-1">
        {campaigns?.map((row: Partial<Campaign> | undefined, i: number) => {
          if (!row) return null;
          const draftNotAllowed =
            (userRole === MemberRole.Caller ||
              userRole === MemberRole.Member) &&
            row.status === "draft";
          return (
            row.status !== "archived" &&
            !draftNotAllowed && (
              <NavLink
                to={`campaigns/${row.id}`}
                key={row.id}
                className={handleNavlinkStyles}
                onClick={() => setCampaignsListOpen(false)}
                prefetch="intent"
              >
                <span className="line-clamp-2 leading-tight">
                  {row.title || `Unnamed campaign ${i + 1}`}
                </span>
                <StatusBadge status={row.status || ""} />
              </NavLink>
            )
          );
        })}
      </nav>
      <nav>
        <NavLink
          className={({ isActive }) =>
            `flex items-center justify-center rounded-md px-4 py-2 font-Zilla-Slab text-sm font-semibold transition-colors ${
              isActive
                ? "bg-secondary text-secondary-foreground"
                : "bg-background/60 text-muted-foreground hover:bg-muted hover:text-foreground"
            }`
          }
          to={"campaigns/archive"}
          onClick={() => setCampaignsListOpen(false)}
        >
          Archived Campaigns (
          {campaigns.filter((i) => i?.status === "archived").length})
        </NavLink>
      </nav>
    </div>
  </Card>
);

export default CampaignsList;
