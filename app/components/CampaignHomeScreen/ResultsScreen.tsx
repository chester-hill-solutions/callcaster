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

type CampaignCounts = {
  completedCount: number | null;
  callCount: number | null;
};

const ResultsScreen = ({
  totalCalls = 0,
  results = [],
  expectedTotal = 0,
  isBusy,
  campaignCounts
}: { 
  totalCalls: number;
  results: CampaignResult[];
  expectedTotal: number;
  isBusy: boolean;
  campaignCounts: CampaignCounts;
}) => {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between">
        <h1 className="mb-6 text-3xl font-bold">Call Campaign Results</h1>
      </div>
      <div className="mb-4 rounded px-8 pb-8 pt-6">
        <div className="flex justify-between">
          <TotalCalls totalCalls={totalCalls} expectedTotal={expectedTotal} />
          <ExportButton isBusy={isBusy} />
        </div>
        <DispositionBreakdown
          results={results}
          totalCalls={campaignCounts.completedCount || 0}
          expectedTotal={campaignCounts.callCount || 0}
        />
        <KeyMetrics
          results={results}
          totalCalls={campaignCounts.completedCount || 0}
          expectedTotal={campaignCounts.callCount || 0}
        />
      </div>
    </div>
  );
};

export default ResultsScreen;
