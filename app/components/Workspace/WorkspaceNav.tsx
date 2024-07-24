import { Link, NavLink, useLocation } from "@remix-run/react";
import { Button } from "../ui/button";
import { MemberRole } from "./TeamMember";
import { MdSettings } from "react-icons/md";

export default function WorkspaceNav({ workspace, isInChildRoute, userRole }) {
  function handleNavlinkStyles(isActive: boolean, isPending: boolean): string {
    if (isActive) {
      return "rounded-md border-2 border-brand-primary bg-brand-primary text-white px-2 py-1 font-Zilla-Slab font-semibold text-black transition-colors duration-150 ease-in-out dark:text-white";
    }

    if (isPending) {
      return "rounded-md bg-brand-tertiary border-2 border-zinc-400 px-2 py-1 font-Zilla-Slab font-semibold text-black transition-colors duration-150 ease-in-out dark:text-white";
    }

    return "rounded-md border-2 border-zinc-300 px-2 py-1 font-Zilla-Slab font-semibold text-black transition-colors duration-150 ease-in-out hover:bg-zinc-100 dark:text-white";
  }

  const userIsCaller = userRole === MemberRole.Caller;
  const path = useLocation().pathname;
  const isEnd = !path.includes("audios") && !path.includes("audiences") && !path.includes("scripts");

  return (
    <div className="flex flex-col justify-center">
      <div className="flex justify-between relative mb-4 items-center">
      {!userIsCaller && (<div></div>)}
        <h3 className="font-Tabac-Slab sm:text-xl">{workspace?.name}</h3>
        {!userIsCaller && (
          <Button size={'icon'} asChild className="" variant={"outline"}>
            <NavLink
              to={isInChildRoute ? "../settings" : `./settings`}
              relative="path"
            >
              <MdSettings size={24}/>
            </NavLink>
          </Button>
        )}
      </div>
      <div className="mb-2 flex items-center text-black dark:text-white">
        <div className="flex flex-1 items-center justify-center sm:justify-start">
          <div className="flex gap-1">
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
              to={isInChildRoute ? `../scripts` : `./scripts`}
              relative="path"
              className={({ isActive, isPending }) =>
                handleNavlinkStyles(isActive, isPending)
              }
            >
              Scripts
            </NavLink>
          )}
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
        </div>
      </div>
    </div>
  );
}
