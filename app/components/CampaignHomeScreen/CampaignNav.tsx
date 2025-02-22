import React from 'react';
import { NavLink } from "@remix-run/react";
import { handleNavlinkStyles } from "~/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '~/components/ui/tooltip';

export const NavigationLinks = ({ hasAccess, data, joinDisabled, }: { hasAccess: boolean, data: any, joinDisabled: string | null }) => (
  <div className="flex gap-2 h-full py-4 max-w-[280px]">
    {hasAccess && (
      <>
        <NavLink
          className={({ isActive, isPending }) => `flex items-center ${handleNavlinkStyles(isActive, isPending)}`}
          to="settings"
          relative="path"
        >
          Settings
        </NavLink>
        <NavLink
          className={({ isActive, isPending }) => `flex items-center ${handleNavlinkStyles(isActive, isPending)}`}
          to="queue"
          relative="path"
        >
          Queue
        </NavLink>
      </>
    )}
    {data?.type === "live_call" && (
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={`flex h-full ${joinDisabled ? 'cursor-not-allowed' : ''}`}>
              <NavLink
                className={({ isActive, isPending }) =>
                  `flex items-center h-full ${handleNavlinkStyles(isActive, isPending)} ${joinDisabled ? 'pointer-events-none opacity-50' : ''}`
                }
                to="call"
                relative="path"
                onClick={(e) => joinDisabled && e.preventDefault()}
              >
                Join Campaign
              </NavLink>
            </div>
          </TooltipTrigger>
          {joinDisabled && (
            <TooltipContent align="end">
              <p>{joinDisabled}</p>
            </TooltipContent>
          )}
        </Tooltip>
      </TooltipProvider>
    )}
  </div>
);