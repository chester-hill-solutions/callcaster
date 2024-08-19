import React from "react";
import { NavLink } from "@remix-run/react";
import { TotalCalls } from "./ResultsScreen.TotalCalls";

export const CampaignInstructions = ({ campaign, data, totalCalls, expectedTotal }) => (
  <div className="flex">
    <div className="flex min-w-[200px] flex-auto p-4">
      <TotalCalls totalCalls={totalCalls} expectedTotal={expectedTotal} />
    </div>
    <div className="p-4">
      <div className="max-w-50 flex flex-col">
        <h3 className="my-4 font-Zilla-Slab text-xl">
          {campaign.instructions?.join || "Join the campaign and start dialing!"}
        </h3>
        <div>
          <NavLink
            className="rounded-md border-2 border-brand-primary bg-brand-primary px-2 py-1 font-Zilla-Slab text-xl font-semibold text-white transition-colors duration-150 ease-in-out dark:text-white"
            to={`${"call"}`}
            relative="path"
          >
            Join Campaign
          </NavLink>
        </div>
      </div>
      <div className="my-4 flex flex-col">
        <h3 className="my-4 font-Zilla-Slab text-xl">
          {campaign.instructions?.script || "Preview the Script and familiarize yourself before dialing."}
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
