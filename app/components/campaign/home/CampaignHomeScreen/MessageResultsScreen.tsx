import { ResultsScreenProps, DispositionResult } from "@/lib/types";
import { TotalMessages } from "./ResultsScreen.TotalCalls";
import { AsyncExportButton } from "./AsyncExportButton";
import { DispositionBreakdown } from "./ResultsScreen.Disposition";
import { KeyMessageMetrics } from "./ResultsScreen.KeyMetrics";
import { NavLink, useNavigation, useParams } from "@remix-run/react";

interface MessageResultsScreenProps {
  results: DispositionResult[];
  type?: string;
  hasAccess?: boolean;
  totalsByDisposition: Record<string, number>;
  totalOfAllResults: number;
  queueCounts: {
    fullCount: number;
    queuedCount: number;
  };
}

const MessageResultsScreen = ({
  results = [],
  type,
  hasAccess = false,
  totalsByDisposition,
  totalOfAllResults,
  queueCounts,
}: MessageResultsScreenProps) => {
  const { state } = useNavigation();
  const params = useParams();
  const campaignId = params.selected_id || "";
  const workspaceId = params.id || "";
  
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between">
        <h1 className="mb-6 text-3xl font-bold">Message Campaign Results</h1>
      </div>
      <div className="mb-4 rounded px-8 pb-8 pt-6">
        <div className="flex justify-between">
          <TotalMessages
            totalMessages={totalOfAllResults || 0}
            expectedTotal={queueCounts.fullCount || 0}
          />
          <AsyncExportButton campaignId={campaignId} workspaceId={workspaceId} />
        </div>
        <DispositionBreakdown
          results={results}
          totalsByDisposition={totalsByDisposition}
          totalOfAllResults={totalOfAllResults}
        />
        <KeyMessageMetrics
          results={results}
          totalsByDisposition={totalsByDisposition}
          totalOfAllResults={totalOfAllResults}
        />
      </div>
    </div>
  );
};

export default MessageResultsScreen;
