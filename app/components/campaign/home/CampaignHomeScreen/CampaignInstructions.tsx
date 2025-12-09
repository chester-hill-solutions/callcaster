import React from "react";
import { NavLink } from "@remix-run/react";
import { TotalCalls } from "./ResultsScreen.TotalCalls";
import { Button } from "~/components/ui/button";
import { CampaignSettingsData } from "~/hooks/campaign/useCampaignSettings";

export const CampaignInstructions = ({ campaignData, totalCalls, expectedTotal, joinDisabled }: { campaignData: CampaignSettingsData, totalCalls: number, expectedTotal: number, joinDisabled: string | null }) => (
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
          <Button asChild disabled={joinDisabled ? true : false}>
          <NavLink
            to={`${"call"}`}
            relative="path"
          >
            Join Campaign
          </NavLink>
          </Button>
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
