import { TotalCalls } from "./ResultsScreen.TotalCalls";
import { ExportButton } from "./ResultsScreen.ExportButton";
import { DispositionBreakdown } from "./ResultsScreen.Disposition";
import { KeyMetrics } from "./ResultsScreen.KeyMetrics";

const ResultsScreen = ({
  totalCalls = 0,
  results = [],
  expectedTotal = 0,
  isBusy,
  campaignCounts
}: { totalCalls: number, results: any, expectedTotal: number, isBusy: boolean, campaignCounts: any }) => {

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
          totalCalls={campaignCounts.completedCount}
          expectedTotal={campaignCounts.callCount}
        />
        <KeyMetrics
          results={results}
          totalCalls={campaignCounts.completedCount}
          expectedTotal={campaignCounts.callCount}
        />
      </div>
    </div>
  );
};

export default ResultsScreen;
