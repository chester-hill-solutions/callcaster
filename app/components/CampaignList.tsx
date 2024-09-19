import React from "react";
import { NavLink } from "@remix-run/react";
import { FaPlus } from "react-icons/fa";
import { Card, CardHeader } from "~/components/ui/card";
import { MemberRole } from "~/components/Workspace/TeamMember";
import { Badge } from "~/components/ui/badge";

const handleNavlinkStyles = ({ isActive, isPending }) =>
  `flex justify-between bg-gray-100 border-2 dark:bg-zinc-900 items-center py-2 text-sm font-medium transition-colors transition-borders font-Zilla-Slab ${
    isActive
      ? "border-primary border-b-2 text-primary-accent bg-white dark:bg-slate-700"
      : isPending
      ? "bg-muted border-b-0"
      : "hover:bg-muted dark:hover:bg-zinc-500 border-b-0"
  }`;

const StatusBadge = ({ status }) => {
  const badgeStyles = {
    pending:"bg-yellow-200 text-yellow-800",
    scheduled: "bg-blue-200 text-blue-800",
    draft: "bg-gray-200 text-gray-800",
    running: "bg-green-200 text-green-800",
    active: "bg-green-200 text-green-800",
    paused: "bg-orange-200 text-orange-800",
    complete: "bg-teal-100 text-teal-800",
  };

  return (
    <Badge className={`text-xxs mx-2 ${badgeStyles[status] || ""}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  );
};

const CampaignsList = ({ campaigns, userRole, setCampaignsListOpen }) => (
  <Card className="flex flex-auto flex-col border-none bg-secondary dark:bg-blue-950">
    <CardHeader className="p-0">
      <NavLink
        to={`campaigns/new`}
        className="flex items-center justify-center gap-2 rounded-none bg-primary p-2 text-primary-foreground md:rounded-t-lg"
      >
        <span>Add Campaign</span>
        <FaPlus size="16" />
      </NavLink>
    </CardHeader>
    <div className="flex flex-grow flex-col justify-between">
      <nav className="flex flex-col">
        {campaigns?.map((row, i) => {
          const draftNotAllowed =
            (userRole === MemberRole.Caller || userRole === MemberRole.Member) &&
            row.status === "draft";
          return (
            row.status !== "archived" &&
            !draftNotAllowed && (
              <NavLink
                to={`campaigns/${row.id}`}
                key={row.id}
                className={handleNavlinkStyles}
                onClick={() => setCampaignsListOpen(false)}
              >
                <span className="px-2">{row.title || `Unnamed campaign ${i + 1}`}</span>
                <StatusBadge status={row.status} />
              </NavLink>
            )
          );
        })}
      </nav>
      <nav className="">
        <NavLink
          className={`pointer-events-none flex items-center justify-center rounded-b-md bg-gray-100 dark:bg-zinc-900 px-4 py-2 font-Zilla-Slab text-sm font-medium transition-colors hover:bg-white dark:hover:bg-zinc-500`}
          to={"#"}
        >
          {/* Todo: build "campaigns/archive" to display completed campaigns */}
          Archived Campaigns ({campaigns.filter((i) => i.status === "archived").length})
        </NavLink>
      </nav>
    </div>
  </Card>
);

export default CampaignsList;