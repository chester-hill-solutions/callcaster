import { NavLink } from "@remix-run/react";
import { FaPlus } from "react-icons/fa";
import { Card, CardHeader } from "~/components/ui/card";
import { MemberRole } from "~/components/Workspace/TeamMember";

const handleNavlinkStyles = ({ isActive, isPending }) =>
    `flex bg-gray-100 dark:bg-zinc-900 items-center px-4 py-2 text-sm font-medium transition-colors font-Zilla-Slab ${
      isActive
        ? "border-primary border-2 text-primary-accent bg-white dark:bg-slate-700"
        : isPending
          ? "bg-muted"
          : "hover:bg-muted dark:hover:bg-zinc-500"
    }`;



const CampaignsList = ({campaigns, userRole, setCampaignsListOpen}) => (
    <Card className="flex flex-auto flex-col border-none bg-secondary dark:bg-blue-950 ">
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
              (userRole === MemberRole.Caller ||
                userRole === MemberRole.Member) &&
              row.status === "draft";
            return (
              row.status !== "complete" &&
              !draftNotAllowed && (
                <NavLink
                  to={`campaigns/${row.id}`}
                  key={row.id}
                  className={handleNavlinkStyles}
                  onClick={() => setCampaignsListOpen(false)}
                >
                  {row.title || `Unnamed campaign ${i + 1}`}
                </NavLink>
              )
            );
          })}
        </nav>
        <nav className="">
          <NavLink
            className={`flex items-center justify-center rounded-b-md bg-gray-100 dark:bg-zinc-900 px-4 py-2 font-Zilla-Slab text-sm font-medium transition-colors hover:bg-white dark:hover:bg-zinc-500`}
            to={"#"}
          >
            {" "}
            {/* Todo: build "campaigns/archive" to display completed campaigns */}
            Archived Campaigns (
            {campaigns.filter((i) => i.status === "complete").length})
          </NavLink>
        </nav>
      </div>
    </Card>
  );

export default CampaignsList;