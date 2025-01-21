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

  const baseUrl = `/workspaces/${workspace.id}`;

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
            {NAV_ITEMS.filter(item => !userIsCaller || !item.callerHidden).map((item) => (
              <NavLink
                key={item.name}
                to={`${baseUrl}${item.path ? `/${item.path}` : ''}`}
                className={handleNavlinkStyles}
                end={item.end}
              >
                {item.name}
              </NavLink>
            ))}
          </div>
          <div className="flex gap-1">
            {(userRole === MemberRole.Admin || userRole === MemberRole.Owner) && (
              <NavLink
                to={`${baseUrl}/settings`}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-gray-500 transition-all hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-50 ${
                  location.pathname.endsWith('/settings') ? "bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-50" : ""
                }`}
                end={true}
              >
                <MdSettings className="h-4 w-4" />
                Settings
              </NavLink>
            )}
            <NavLink
              to={`${baseUrl}/billing`}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-gray-500 transition-all hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-50 ${
                location.pathname.endsWith('/billing') ? "bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-50" : ""
              }`}
            >
              <MdCreditCard className="h-4 w-4" />
              Credits: {workspace.credits}
            </NavLink>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WorkspaceNav;
