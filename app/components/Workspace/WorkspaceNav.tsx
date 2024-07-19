import React from 'react';
import { NavLink, useLocation } from "@remix-run/react";
import { Button } from "../ui/button";
import { MemberRole } from "./TeamMember";
import { MdSettings } from "react-icons/md";

export default function WorkspaceNav({ workspace, userRole }) {
  const location = useLocation();
  const userIsCaller = userRole === MemberRole.Caller;

  function handleNavlinkStyles(isActive: boolean, isPending: boolean): string {
    if (isActive) {
      return "rounded-md border-2 border-brand-primary bg-brand-primary text-white px-2 py-1 font-Zilla-Slab font-semibold transition-colors duration-150 ease-in-out";
    }

    if (isPending) {
      return "rounded-md bg-brand-tertiary border-2 border-zinc-400 px-2 py-1 font-Zilla-Slab font-semibold text-black transition-colors duration-150 ease-in-out dark:text-white";
    }

    return "rounded-md border-2 border-zinc-300 px-2 py-1 font-Zilla-Slab font-semibold text-black transition-colors duration-150 ease-in-out hover:bg-zinc-100 dark:text-white";
  }

  const pathParts = location.pathname.split('/').filter(Boolean);
  const workspaceId = pathParts[1];
  const basePath = `/workspaces/${workspaceId}`;

  const isCampaignsActive = () => {
    return pathParts.length === 2 || (pathParts.length === 3 && pathParts[2] === '');
  };

  return (
    <div className="flex flex-col justify-center">
      <div className="flex justify-between relative mb-4 items-center">
        <h3 className="font-Tabac-Slab sm:text-xl">{workspace?.name}</h3>
        {!userIsCaller && (
          <Button size={'icon'} asChild className="" variant={"outline"}>
            <NavLink to={`${basePath}/settings`}>
              <MdSettings size={24}/>
            </NavLink>
          </Button>
        )}
      </div>
      <div className="mb-2 flex items-center text-black dark:text-white">
        <div className="flex flex-1 items-center justify-center sm:justify-start">
          <div className="flex gap-1">
            <NavLink
              to={basePath}
              className={({ isActive, isPending }) =>
                handleNavlinkStyles(isCampaignsActive(), isPending)
              }
              end
            >
              Campaigns
            </NavLink>

            {!userIsCaller && (
              <>
                <NavLink
                  to={`${basePath}/scripts`}
                  className={({ isActive, isPending }) =>
                    handleNavlinkStyles(isActive, isPending)
                  }
                >
                  Scripts
                </NavLink>
                <NavLink
                  to={`${basePath}/audios`}
                  className={({ isActive, isPending }) =>
                    handleNavlinkStyles(isActive, isPending)
                  }
                >
                  Audio
                </NavLink>
                <NavLink
                  to={`${basePath}/audiences`}
                  className={({ isActive, isPending }) =>
                    handleNavlinkStyles(isActive, isPending)
                  }
                >
                  Audiences
                </NavLink>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}