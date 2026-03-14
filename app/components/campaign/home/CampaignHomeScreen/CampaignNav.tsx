import React from "react";
import { NavLink } from "@remix-run/react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Campaign } from "@/lib/types";

const navLinkClass = ({
  isActive,
  isPending,
}: {
  isActive: boolean;
  isPending: boolean;
}) =>
  `flex items-center rounded-lg border px-3 py-2 font-Zilla-Slab text-sm font-semibold transition-colors ${
    isActive
      ? "border-brand-primary bg-brand-primary/10 text-brand-primary dark:border-brand-secondary dark:bg-brand-secondary/20 dark:text-brand-secondary"
      : isPending
        ? "border-border bg-muted"
        : "border-transparent bg-background/70 text-foreground hover:border-border hover:bg-muted"
  }`;

export const NavigationLinks = ({
  hasAccess,
  data,
  joinDisabled,
}: {
  hasAccess: boolean;
  data: Campaign | null | undefined;
  joinDisabled: string | null;
}) => (
  <div className="flex h-full max-w-[320px] flex-wrap gap-2 py-2">
    {hasAccess && (
      <>
        <NavLink className={navLinkClass} to="settings" relative="path">
          Settings
        </NavLink>
        <NavLink className={navLinkClass} to="queue" relative="path">
          Queue
        </NavLink>
      </>
    )}
    {data?.type === "live_call" && (
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className={`flex h-full ${joinDisabled ? "cursor-not-allowed" : ""}`}
            >
              <NavLink
                className={({ isActive, isPending }) =>
                  `${navLinkClass({ isActive, isPending })} ${joinDisabled ? "pointer-events-none opacity-50" : ""}`
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
