import { TotalCalls } from "./ResultsScreen.TotalCalls";
import { AsyncExportButton } from "./AsyncExportButton";
import { DispositionBreakdown } from "./ResultsScreen.Disposition";
import { KeyMetrics } from "./ResultsScreen.KeyMetrics";
import { useParams } from "@remix-run/react";

type CampaignResult = {
  disposition: string;
  count: number;
  average_call_duration: string;
  average_wait_time: string;
  expected_total: number;
};


const ResultsScreen = ({
  totalsByDisposition,
  totalOfAllResults,
  isBusy,
  results,
  hasAccess,
  queueCounts
}: { 
  totalsByDisposition: Record<string, number> | null;
  totalOfAllResults: number;
  isBusy: boolean;
  results: CampaignResult[];
  hasAccess: boolean;
  queueCounts: {
    fullCount: number;
    queuedCount: number;
  };
}) => {
  const params = useParams();
  const campaignId = params.selected_id || "";
  const workspaceId = params.id || "";
  
  const safeDispositionTotals = totalsByDisposition || {};
  
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between">
        <h1 className="mb-6 text-3xl font-bold">Call Campaign Results</h1>
      </div>
      <div className="mb-4 rounded px-8 pb-8 pt-6">
        <div className="flex justify-between">
          <TotalCalls totalCalls={totalOfAllResults || 0} expectedTotal={queueCounts.fullCount || 0} />
          <AsyncExportButton campaignId={campaignId} workspaceId={workspaceId} />
        </div>
        <DispositionBreakdown
          results={results}
          totalsByDisposition={safeDispositionTotals}
          totalOfAllResults={totalOfAllResults}
        />
        <KeyMetrics
          results={results}
          totalsByDisposition={safeDispositionTotals}
          totalOfAllResults={totalOfAllResults}
        />
      </div>
    </div>
  );
};

export default ResultsScreen;
