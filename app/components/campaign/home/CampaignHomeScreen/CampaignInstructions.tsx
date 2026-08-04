import React from "react";
import { NavLink } from "react-router";
import { TotalCalls } from "./ResultsScreen.TotalCalls";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface CampaignInstructionsProps {
  campaignData: {
    [key: string]: unknown;
    instructions?: {
      join?: string;
      script?: string;
    };
  };
  totalCalls: number;
  expectedTotal: number;
  joinDisabled: string | null;
}

export const CampaignInstructions = ({ campaignData, totalCalls, expectedTotal, joinDisabled }: CampaignInstructionsProps) => (
  <div className="flex">
    <div className="flex min-w-[200px] flex-auto p-4">
      <TotalCalls totalCalls={totalCalls} expectedTotal={expectedTotal} />
    </div>
    <div className="p-4">
      <div className="max-w-50 flex flex-col">
        <h3 className="my-4 font-Zilla-Slab text-xl">
          {campaignData?.instructions?.join || "Join the campaign and start dialing!"}
        </h3>
        <div>
          {joinDisabled ? (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  {/* A disabled button cannot receive focus, so its tooltip needs a focusable wrapper. */}
                  {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
                  <span className="inline-flex cursor-not-allowed" tabIndex={0}>
                    <Button type="button" disabled>
                      Join Campaign
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{joinDisabled}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <Button asChild>
              <NavLink to="call" relative="path">
                Join Campaign
              </NavLink>
            </Button>
          )}
          {joinDisabled ? (
            <p className="mt-2 max-w-xs text-sm text-muted-foreground" role="status">
              {joinDisabled}
            </p>
          ) : null}
        </div>
      </div>
      <div className="my-4 flex flex-col">
        <h3 className="my-4 font-Zilla-Slab text-xl">
          {campaignData?.instructions?.script || "Preview the Script and familiarize yourself before dialing."}
        </h3>
        <div>
          <NavLink
            className="rounded-md border-2 border-brand-primary bg-brand-primary px-2 py-1 font-Zilla-Slab text-xl font-semibold text-white transition-colors duration-150 ease-in-out dark:text-white"
            to="script"
            relative="path"
          >
            View Script
          </NavLink>
        </div>
      </div>
    </div>
  </div>
);
