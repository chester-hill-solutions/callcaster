import { NavLink, useLocation } from "@remix-run/react";
import { Button } from "../ui/button";
import { MemberRole } from "./TeamMember";
import { MdSettings } from "react-icons/md";

const NAV_ITEMS = [
  { name: "Campaigns", path: "", end: true },
  { name: "Chats", path: "chats" },
  { name: "Scripts", path: "scripts", callerHidden: true },
  { name: "Audio", path: "audios", callerHidden: true },
  { name: "Audiences", path: "audiences", callerHidden: true },
];

export default function WorkspaceNav({ workspace, userRole }) {
  const location = useLocation();
  const userIsCaller = userRole === MemberRole.Caller;

  const getWorkspaceBaseUrl = () => {
    const pathSegments = location.pathname.split("/");
    const workspaceIndex = pathSegments.findIndex(
      (segment) => segment === "workspaces",
    );
    if (workspaceIndex !== -1 && workspaceIndex + 1 < pathSegments.length) {
      return pathSegments.slice(0, workspaceIndex + 2).join("/");
    }
    return "/workspaces";
  };

  const baseUrl = getWorkspaceBaseUrl();

  function handleNavlinkStyles({ isActive, isPending }) {
    if (isActive) {
      return "rounded-md border-2 border-brand-primary bg-brand-primary text-white px-2 py-1 font-Zilla-Slab font-semibold text-black transition-colors duration-150 ease-in-out dark:text-white";
    }
    if (isPending) {
      return "rounded-md bg-brand-tertiary border-2 border-zinc-400 px-2 py-1 font-Zilla-Slab font-semibold text-black transition-colors duration-150 ease-in-out dark:text-white";
    }
    return "rounded-md border-2 border-zinc-300 px-2 py-1 font-Zilla-Slab font-semibold text-black transition-colors duration-150 ease-in-out hover:bg-zinc-100 dark:text-white";
  }

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
                (!item.callerHidden || !userIsCaller) && (
                  <NavLink
                    key={item.name}
                    to={`${baseUrl}/${item.path}`}
                    className={handleNavlinkStyles}
                    end={item.end}
                  >
                    {item.name}
                  </NavLink>
                ),
            )}
          </div>
          <div>
            {!userIsCaller && (
              <Button size={"icon"} asChild variant={"outline"}>
                <NavLink to={`${baseUrl}/settings`} className="border-2 border-zinc-400">
                  <MdSettings size={24} />
                </NavLink>
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
