import { useNavigation } from "@remix-run/react";
import MessageResultsScreen from "../MessageResultsScreen";
import ResultsScreen from "../ResultsScreen";
import { Campaign } from "@/lib/types";

type CampaignResult = {
  disposition: string;
  count: number;
  average_call_duration: string;
  average_wait_time: string;
  expected_total: number;
};

function getTotalsByDisposition(results: CampaignResult[]) {
  return results.reduce(
    (acc, result) => {
      acc[result.disposition as string] =
        (acc[result.disposition as string] || 0) + result.count;
      return acc;
    },
    {} as Record<string, number>,
  );
}

export function ResultsDisplay({
  results,
  campaign,
  hasAccess,
  queueCounts,
}: {
  results: CampaignResult[];
  campaign: NonNullable<Campaign>;
  hasAccess: boolean;
  queueCounts: {
    fullCount: number;
    queuedCount: number;
  };
}) {
  const nav = useNavigation();
  const isBusy = nav.state !== "idle";
  const totalsByDisposition = getTotalsByDisposition(results);
  const totalOfAllResults = results.reduce(
    (acc, result) => acc + result.count,
    0,
  );
  return campaign?.type === "message" ? (
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
}
