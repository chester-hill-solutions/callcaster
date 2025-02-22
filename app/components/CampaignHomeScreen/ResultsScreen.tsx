import { TotalCalls } from "./ResultsScreen.TotalCalls";
import { ExportButton } from "./ResultsScreen.ExportButton";
import { DispositionBreakdown } from "./ResultsScreen.Disposition";
import { KeyMetrics } from "./ResultsScreen.KeyMetrics";

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
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between">
        <h1 className="mb-6 text-3xl font-bold">Call Campaign Results</h1>
      </div>
      <div className="mb-4 rounded px-8 pb-8 pt-6">
        <div className="flex justify-between">
          <TotalCalls totalCalls={totalOfAllResults || 0} expectedTotal={queueCounts.fullCount || 0} />
          <ExportButton isBusy={isBusy} />
        </div>
        <DispositionBreakdown
          results={results}
          totalsByDisposition={totalsByDisposition}
          totalOfAllResults={totalOfAllResults}
        />
        <KeyMetrics
          results={results}
          totalsByDisposition={totalsByDisposition}
          totalOfAllResults={totalOfAllResults}
        />
      </div>
    </div>
  );
};

export default ResultsScreen;
