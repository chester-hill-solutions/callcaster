import { useNavigation } from "@remix-run/react";
import ResultsScreen from "./ResultsScreen";
import MessageResultsScreen from "./MessageResultsScreen";
import { CampaignState } from "~/routes/workspaces_.$id.campaigns.$selected_id";

type CampaignResult = {
  disposition: string;
  count: number;
  average_call_duration: string;
  average_wait_time: string;
  expected_total: number;
};

type CampaignCounts = {
  completedCount: number | null;
  callCount: number | null;
};

export const ResultsDisplay = ({ 
  results, 
  campaign, 
  campaignCounts, 
  hasAccess 
}: { 
  results: CampaignResult[];
  campaign: CampaignState;
  campaignCounts: CampaignCounts;
  hasAccess: boolean;
}) => {
  const nav = useNavigation();
  const isBusy = nav.state !== "idle";

  return campaign.type === "message" ? (
    <MessageResultsScreen
      results={results}
      type={campaign.type}
      hasAccess={hasAccess}
    />
  ) : (
    <ResultsScreen
      campaignCounts={campaignCounts}
      isBusy={isBusy}
      results={results}
      hasAccess={hasAccess}
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
