import React from "react";
import { NavLink, useLocation } from "@remix-run/react";
import { Button } from "../ui/button";
import { MemberRole } from "./TeamMember";
import { MdCreditCard, MdSettings } from "react-icons/md";
import { Flags, WorkspaceData } from "~/lib/types";

type NavItem = {
  name: string;
  path: string;
  end?: boolean;
  flag?: {
    parent: string;
    child: string;
  };
  callerHidden?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { name: "Campaigns", path: "", end: true },
  { name: "Chats", path: "chats", flag: { parent: "sms", child: "chat" } },
  { name: "Scripts", path: "scripts", callerHidden: true },
  { name: "Audio", path: "audios", callerHidden: true },
  { name: "Audiences", path: "audiences", callerHidden: true },
];
interface WorkspaceNavProps {
  workspace: {
    id: string;
    name: string;
    credits: number;
  };
  userRole: MemberRole;
}

const WorkspaceNav: React.FC<WorkspaceNavProps> = ({ workspace, userRole }) => {
  const location = useLocation();
  const userIsCaller = userRole === MemberRole.Caller;
  const getWorkspaceBaseUrl = () => {
    const pathSegments = location.pathname.split("/");
    const workspaceIndex = pathSegments.findIndex(
      (segment) => segment === "workspaces",
    );
    return workspaceIndex !== -1 && workspaceIndex + 1 < pathSegments.length
      ? pathSegments.slice(0, workspaceIndex + 2).join("/")
      : "/workspaces";
  };

  const baseUrl = getWorkspaceBaseUrl();

  const handleNavlinkStyles = ({
    isActive,
    isPending,
  }: {
    isActive: boolean;
    isPending: boolean;
  }) => {
    if (isActive) {
      return "rounded-md border-2 border-brand-primary bg-brand-primary text-white px-2 py-1 font-Zilla-Slab font-semibold text-black transition-colors duration-150 ease-in-out dark:text-white";
    }
    if (isPending) {
      return "rounded-md bg-brand-tertiary border-2 border-zinc-400 px-2 py-1 font-Zilla-Slab font-semibold text-black transition-colors duration-150 ease-in-out dark:text-white";
    }
    return "rounded-md border-2 border-zinc-300 px-2 py-1 font-Zilla-Slab font-semibold text-black transition-colors duration-150 ease-in-out hover:bg-zinc-100 dark:text-white";
  };

  return (
    <div className="flex-col justify-center">
      <div className="relative mb-4 flex items-center justify-between">
        <h3 className="font-Tabac-Slab sm:text-xl">{workspace?.name}</h3>
      </div>
      <div className="mb-2 flex items-center text-black dark:text-white">
        <div className="flex flex-1 items-center justify-center sm:justify-between">
          <div className="flex gap-1">
            {NAV_ITEMS.map(
              (item) =>
                (!item.callerHidden || !userIsCaller) &&
                <NavLink
                  key={item.name}
                  to={`${baseUrl}/${item.path}`}
                  className={handleNavlinkStyles}
                  end={item.end}
                  prefetch="intent"
                >
                  {item.name}
                </NavLink>

            )}
          </div>
          <div>
            {!userIsCaller && (
              <div className="flex gap-1">
                <Button size="icon" asChild variant="outline">
                  <NavLink
                    prefetch="intent"
                    to={`${baseUrl}/settings`}
                    className="border-2 border-zinc-400"
                  >
                    <MdSettings size={24} />
                  </NavLink>
                </Button>
                <Button asChild variant="outline">
                  <NavLink
                    to={`${baseUrl}/settings/credits`}
                    className="border-2 border-zinc-400 flex items-center gap-1 relative"
                    prefetch="intent"
                  >
                    <MdCreditCard size={24} /> {workspace?.credits} <span className="text-xs absolute -bottom-5">Call Credits</span>
                  </NavLink>
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default WorkspaceNav;
