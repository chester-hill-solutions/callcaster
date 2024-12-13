import { useNavigation } from "@remix-run/react";
import ResultsScreen from "./ResultsScreen";
import MessageResultsScreen from "./MessageResultsScreen";

export const ResultsDisplay = ({ results, campaign, campaignCounts, hasAccess }: 
  { results: any, campaign: any, campaignCounts: any, hasAccess: boolean }) => {

  const totalCalls = campaignCounts?.completedCount;
  const expectedTotal = campaignCounts?.callCount || 0;
  const nav = useNavigation();
  const isBusy = nav.state !== "idle";

  return campaign.type === "message" ? (
    <MessageResultsScreen
      totalCalls={totalCalls}
      results={results}
      expectedTotal={expectedTotal}
      type={campaign.type}
      dial_type={campaign.dial_type}
    />
  ) : (
    <ResultsScreen
      campaignCounts={campaignCounts}
      isBusy={isBusy}
      totalCalls={totalCalls}
      results={results}
      expectedTotal={expectedTotal}
    />
  );
};

export const NoResultsYet = () => (
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
