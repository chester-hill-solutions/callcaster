import React from "react";
import { useNavigation } from "@remix-run/react";
import ResultsScreen from "./ResultsScreen";
import MessageResultsScreen from "./MessageResultsScreen";
import { handleNavlinkStyles } from "~/lib/utils";

export const ResultsDisplay = ({ results, campaign, hasAccess, user }) => {
  const totalCalls = results.reduce((sum, item) => sum + item.count, 0);
  const expectedTotal = results[0]?.expected_total || 0;
  const nav = useNavigation();
  const isBusy = nav.state !== "idle";

  return campaign.type === "message" ? (
    <MessageResultsScreen
      totalCalls={totalCalls}
      results={results}
      expectedTotal={expectedTotal}
      type={campaign.type}
      dial_type={campaign.dial_type}
      handleNavlinkStyles={handleNavlinkStyles}
      hasAccess={hasAccess}
    />
  ) : (
    <ResultsScreen
      isBusy={isBusy}
      totalCalls={totalCalls}
      results={results}
      expectedTotal={expectedTotal}
      type={campaign.type}
      dial_type={campaign.dial_type}
      handleNavlinkStyles={handleNavlinkStyles}
      hasAccess={hasAccess}
      campaign_id={campaign.id || campaign.campaignDetails?.campaign_id}
      user_id={user}
    />
  );
};

export const NoResultsYet = ({ campaign, user, submit }) => (
    <div className="flex flex-auto items-center justify-center gap-2 pb-20 sm:flex-col">
      <h1 className="font-Zilla-Slab text-4xl text-gray-400">
        Your Campaign Results Will Show Here
      </h1>
    </div>
  );

  export const ErrorLoadingResults = () => (
    <div>Error loading results. Please try again.</div>
  );

  export const LoadingResults = () => <div>Loading results...</div>;
