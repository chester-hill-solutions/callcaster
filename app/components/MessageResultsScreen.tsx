
import { ResultsScreenProps } from "~/lib/database.types";
import { TotalMessages } from "./ResultsScreen.TotalCalls";
import { ExportButton } from "./ResultsScreen.ExportButton";
import { DispositionBreakdown } from "./ResultsScreen.Disposition";
import { KeyMessageMetrics } from "./ResultsScreen.KeyMetrics";

const MessageResultsScreen = ({
  totalCalls = 0,
  results = [],
  expectedTotal = 0,
}: ResultsScreenProps) => {
  return (
    <div className="container mx-auto px-4 py-8">
    <h1 className="mb-6 text-3xl font-bold">Message Campaign Results</h1>

    <div className="mb-4 rounded px-8 pb-8 pt-6">
      <div className="flex justify-between">
        <TotalMessages totalMessages={totalCalls} expectedTotal={expectedTotal} />
        <ExportButton />
      </div>
      <DispositionBreakdown
        results={results}
        totalCalls={totalCalls}
        expectedTotal={expectedTotal}
      />
      <KeyMessageMetrics
        results={results}
        totalCalls={totalCalls}
        expectedTotal={expectedTotal}
      />
    </div>
    </div>
  );
};

export default MessageResultsScreen;
