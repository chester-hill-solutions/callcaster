import { DispositionResult } from "@/lib/types";
import { TotalMessages } from "./ResultsScreen.TotalCalls";
import { CampaignExportButton } from "./CampaignExportButton";
import { DispositionBreakdown } from "./ResultsScreen.Disposition";
import { KeyMessageMetrics } from "./ResultsScreen.KeyMetrics";
import { useParams } from "react-router";

interface MessageResultsScreenProps {
  results: DispositionResult[];
  hasAccess?: boolean;
  campaignStatus?: string | null;
  campaignTitle?: string | null;
  totalsByDisposition: Record<string, number>;
  totalOfAllResults: number;
  queueCounts: {
    fullCount: number;
    queuedCount: number;
    completedCount: number;
  };
}

const MessageResultsScreen = ({
  results = [],
  hasAccess = false,
  campaignStatus,
  campaignTitle,
  totalsByDisposition,
  totalOfAllResults,
  queueCounts,
}: MessageResultsScreenProps) => {
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
          <TotalMessages totalMessages={totalOfAllResults || 0} />
          {!/(^|[^a-z0-9])test([^a-z0-9]|$)/i.test(campaignTitle ?? "") ? (
            <CampaignExportButton
              campaignId={campaignId}
              workspaceId={workspaceId}
              exportType="sms-report"
              label="Generate SMS report"
              downloadingLabel="Download report"
              disabled={!hasAccess || campaignStatus !== "complete"}
            />
          ) : null}
        </div>
        <p className="text-muted-foreground mb-6 text-sm">
          Contacts completed: {queueCounts.completedCount || 0} of{" "}
          {queueCounts.fullCount || 0}
        </p>
        <DispositionBreakdown
          unit="messages"
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
