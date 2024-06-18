import { Link, NavLink, useLocation } from "@remix-run/react";
import { Button } from "../ui/button";
import { MemberRole } from "./TeamMember";

export default function WorkspaceNav({ workspace, isInChildRoute, userRole }) {
  function handleNavlinkStyles(isActive: boolean, isPending: boolean): string {
    if (isActive) {
      return "rounded-md border-2 border-brand-primary bg-brand-primary text-white px-2 py-1 font-Zilla-Slab text-xl font-semibold text-black transition-colors duration-150 ease-in-out dark:text-white";
    }

    if (isPending) {
      return "rounded-md bg-brand-tertiary border-2 border-zinc-400 px-2 py-1 font-Zilla-Slab text-xl font-semibold text-black transition-colors duration-150 ease-in-out dark:text-white";
    }

    return "rounded-md border-2 border-zinc-300 px-2 py-1 font-Zilla-Slab text-xl font-semibold text-black transition-colors duration-150 ease-in-out hover:bg-zinc-100 dark:text-white";
  }

  const userIsCaller = userRole === MemberRole.Caller;
  const path = useLocation().pathname;
  const isEnd = !path.includes("audios") && !path.includes("audiences");

  return (
    <div className="mb-2 flex items-center text-black dark:text-white">
      <div className="flex flex-1 justify-between">
        <div className="flex gap-4">
          <NavLink
            to={isInChildRoute ? `..` : `.`}
            relative="path"
            className={({ isActive, isPending }) =>
              handleNavlinkStyles(isActive, isPending)
            }
            end={!isEnd}
          >
            Campaigns
          </NavLink>
          {!userIsCaller && (
            <NavLink
              to={isInChildRoute ? `../audios` : `./audios`}
              relative="path"
              className={({ isActive, isPending }) =>
                handleNavlinkStyles(isActive, isPending)
              }
            >
              Audio
            </NavLink>
          )}

          {!userIsCaller && (
            <NavLink
              to={isInChildRoute ? `../audiences` : `./audiences`}
              relative="path"
              className={({ isActive, isPending }) =>
                handleNavlinkStyles(isActive, isPending)
              }
            >
              Audiences
            </NavLink>
          )}
        </div>
        <h3 className="absolute left-1/2 translate-x-[-50%] font-Tabac-Slab text-2xl">
          {workspace?.name}
        </h3>
        <Button asChild variant="outline">
          <Link
            to={isInChildRoute ? "../settings" : `./settings`}
            relative="path"
            className="border-2 border-zinc-300 font-Zilla-Slab text-xl font-semibold"
          >
            Workspace Settings
          </Link>
        </Button>
      </div>
    </div>
  );
}
