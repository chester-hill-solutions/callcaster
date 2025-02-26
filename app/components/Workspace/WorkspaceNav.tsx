import React from "react";
import { NavLink,  } from "@remix-run/react";
import { MdCreditCard, MdSettings } from "react-icons/md";
import { MemberRole } from "./TeamMember";

interface NavItem {
  name: string;
  path: string;
  end?: boolean;
  callerHidden?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { name: "Campaigns", path: "", end: true },
  { name: "Chats", path: "chats" },
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

const WorkspaceNav = ({ workspace, userRole }: WorkspaceNavProps) => {
  const userIsCaller = userRole === MemberRole.Caller;
  const isAdmin = userRole === MemberRole.Admin || userRole === MemberRole.Owner;
  const baseUrl = `/workspaces/${workspace.id}`;
  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `rounded-md border-2 px-2 py-1 font-Zilla-Slab font-semibold transition-colors ${
      isActive
        ? "border-brand-primary bg-brand-primary text-white"
        : "border-zinc-300 text-black hover:bg-zinc-100 dark:text-white"
    }`;

  const iconLinkClass = (isActive: boolean) =>
    `flex items-center gap-2 rounded-lg px-3 py-2 transition-all ${
      isActive
        ? "bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-50"
        : "text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-50"
    }`;


  return (
    <div className="flex-col justify-center">
      <h3 className="mb-4 font-Tabac-Slab sm:text-xl">{workspace.name}</h3>
      
      <div className="mb-2 flex items-center justify-between">
        <div className="flex gap-1">
          {NAV_ITEMS.filter(item => !userIsCaller || !item.callerHidden).map((item) => (
            <NavLink
              key={item.name}
              to={`${baseUrl}${item.path ? `/${item.path}` : ''}`}
              className={navLinkClass}
              end={item.end}
            >
              {item.name}
            </NavLink>
          ))}
        </div>

        <div className="flex gap-1">
            <NavLink
              to={`${baseUrl}/settings`}
              className={({ isActive }) => iconLinkClass(isActive)}
              end
            >
              <MdSettings className="h-4 w-4" />
              Settings
            </NavLink>
          {isAdmin && (
          <NavLink
            to={`${baseUrl}/billing`}
            className={({ isActive }) => iconLinkClass(isActive)}
          >
            <MdCreditCard className="h-4 w-4" />
            Credits: {workspace.credits}
          </NavLink>)}
        </div>
      </div>
    </div>
  );
};

export default WorkspaceNav;
