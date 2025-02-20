import { useNavigation } from "@remix-run/react";
import ResultsScreen from "./ResultsScreen";
import MessageResultsScreen from "./MessageResultsScreen";
import { CampaignState } from "~/routes/workspaces_.$id.campaigns.$selected_id";
import { Campaign } from "~/lib/types";

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

const getTotalsByDisposition = (results: CampaignResult[]) => {
  return results.reduce((acc, result) => {
    acc[result.disposition as string] = (acc[result.disposition as string] || 0) + result.count;
    return acc;
  }, {} as Record<string, number>);
};


export const ResultsDisplay = ({ 
  results, 
  campaign, 
  hasAccess,
  queueCounts
}: { 
  results: CampaignResult[];
  campaign: NonNullable<Campaign>;
  hasAccess: boolean;
  queueCounts: {
    fullCount: number;
    queuedCount: number;
  };
}) => {
  const nav = useNavigation();
  const isBusy = nav.state !== "idle";
  const totalsByDisposition = getTotalsByDisposition(results);
  const totalOfAllResults = results.reduce((acc, result) => acc + result.count, 0);
  return campaign.type === "message" ? (
    <MessageResultsScreen
      totalsByDisposition={totalsByDisposition}
      totalOfAllResults={totalOfAllResults}
      results={results}
      type={campaign.type}
      hasAccess={hasAccess}
      queueCounts={queueCounts}
    />
  ) : (
    <ResultsScreen
      totalsByDisposition={totalsByDisposition}
      totalOfAllResults={totalOfAllResults}
      isBusy={isBusy}
      results={results}
      hasAccess={hasAccess}
      queueCounts={queueCounts}
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
