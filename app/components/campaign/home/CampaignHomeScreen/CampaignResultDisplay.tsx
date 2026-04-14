import { useNavigation } from "@remix-run/react";
import ResultsScreen from "./ResultsScreen";
import MessageResultsScreen from "./MessageResultsScreen";
import { CampaignState } from "@/routes/workspaces_.$id.campaigns.$selected_id";
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
