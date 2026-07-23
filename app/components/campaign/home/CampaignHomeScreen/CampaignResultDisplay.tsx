import { useNavigation } from "react-router";
import ResultsScreen from "./ResultsScreen";
import MessageResultsScreen from "./MessageResultsScreen";
import { Text } from "@/components/ui/typography";
import {
  campaignTypeCollectsIvrResponses,
  type IvrQuestionResults,
} from "@/lib/ivr-results";
import { Campaign } from "@/lib/types";

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

const HIDDEN_DISPOSITIONS = new Set(["idle", "no disposition"]);

const normalizeDispositionLabel = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  const lowered = trimmed.toLowerCase();
  if (lowered === "no disposition") return "No Disposition";
  if (lowered === "idle") return "idle";
  return lowered;
};

const aggregateDispositionResults = (results: CampaignResult[]) => {
  const aggregated = new Map<string, CampaignResult>();

  for (const result of results) {
    const normalizedDisposition = normalizeDispositionLabel(result.disposition);
    if (!normalizedDisposition) continue;

    const existing = aggregated.get(normalizedDisposition);
    if (!existing) {
      aggregated.set(normalizedDisposition, {
        ...result,
        disposition: normalizedDisposition,
      });
      continue;
    }

    existing.count += result.count;
    if (
      (!existing.average_call_duration || existing.average_call_duration === "00:00:00") &&
      result.average_call_duration
    ) {
      existing.average_call_duration = result.average_call_duration;
    }
  }

  return Array.from(aggregated.values());
};

export const ResultsDisplay = ({
  results,
  campaign,
  hasAccess,
  queueCounts,
  ivrResponses,
}: {
  results: CampaignResult[];
  campaign: NonNullable<Campaign>;
  hasAccess: boolean;
  queueCounts: {
    fullCount: number;
    queuedCount: number;
  };
  ivrResponses?: IvrQuestionResults[] | null;
}) => {
  const nav = useNavigation();
  const isBusy = nav.state !== "idle";
  const normalizedResults = aggregateDispositionResults(results);
  const baseVisibleResults = normalizedResults.filter(
    (result) => !HIDDEN_DISPOSITIONS.has(result.disposition.toLowerCase()),
  );
  const visibleResults = baseVisibleResults;
  const totalsByDisposition = visibleResults.reduce(
    (acc, result) => {
      acc[result.disposition] = result.count;
      return acc;
    },
    {} as Record<string, number>,
  );
  const totalOfAllResults = visibleResults.reduce(
    (acc, result) => acc + result.count,
    0,
  );

  return campaign?.type === "message" ? (
    <MessageResultsScreen
      totalsByDisposition={totalsByDisposition}
      totalOfAllResults={totalOfAllResults}
      results={visibleResults}
      type={campaign.type}
      hasAccess={hasAccess}
      queueCounts={queueCounts}
    />
  ) : (
    <ResultsScreen
      totalsByDisposition={totalsByDisposition}
      totalOfAllResults={totalOfAllResults}
      isBusy={isBusy}
      results={visibleResults}
      hasAccess={hasAccess}
      queueCounts={queueCounts}
      // Only IVR-style campaigns record responses; for anything else there is no
      // response section to show, empty or otherwise.
      ivrResponses={
        campaignTypeCollectsIvrResponses(campaign?.type)
          ? (ivrResponses ?? [])
          : null
      }
    />
  );
};

/**
 * Empty campaign results: same chrome as {@link ResultsDisplay}, with a quiet
 * work-surface note instead of a branded billboard heading.
 */
export const NoResultsYet = ({
  expectedTotal = 0,
  campaignType,
}: {
  expectedTotal?: number;
  campaignType?: Campaign["type"] | null;
}) => {
  const isMessage = campaignType === "message";
  const title = isMessage ? "Message Campaign Results" : "Call Campaign Results";
  const totalLabel = isMessage ? "Total Messages" : "Total Calls";

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="mb-6 text-3xl font-bold">{title}</h1>
      <div className="mb-4 rounded px-8 pb-8 pt-6">
        <div className="mb-8 flex flex-col">
          <h2 className="mb-0 text-2xl font-semibold">
            {totalLabel}: 0
          </h2>
          <h3 className="mb-4 text-xl font-light">of {expectedTotal}</h3>
        </div>
        <div className="mb-8">
          <h3 className="mb-4 text-xl font-semibold">Disposition Breakdown</h3>
          <Text variant="muted">
            Disposition breakdowns appear here as outreach completes.
          </Text>
        </div>
        <div className="mt-8">
          <h3 className="mb-4 text-xl font-semibold">Key Metrics</h3>
          <Text variant="muted">
            Key rates fill in once contacts are reached.
          </Text>
        </div>
      </div>
    </div>
  );
};

export const ErrorLoadingResults = () => (
  <div>Error loading results. Please try again.</div>
);

export const LoadingResults = () => <div>Loading results...</div>;