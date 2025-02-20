import { ResultsScreenProps, DispositionResult } from "~/lib/types";
import { TotalMessages } from "./ResultsScreen.TotalCalls";
import { ExportButton } from "./ResultsScreen.ExportButton";
import { DispositionBreakdown } from "./ResultsScreen.Disposition";
import { KeyMessageMetrics } from "./ResultsScreen.KeyMetrics";
import { NavLink, useNavigation } from "@remix-run/react";

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
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between">
        <h1 className="mb-6 text-3xl font-bold">Message Campaign Results</h1>
        <div className="">
          {hasAccess && (
            <div>
              {type === "live_call" || !type ? (
                <NavLink
                  className={({ isActive }) =>
                    `rounded-md px-3 py-2 font-Zilla-Slab text-lg font-bold transition-colors duration-150 ease-in-out ${isActive
                      ? "bg-brand-primary text-white"
                      : "bg-secondary text-brand-primary hover:bg-white"
                    }`
                  }

                  to={`${type || "call"}`}
                  relative="path"
                >
                  Join Campaign
                </NavLink>
              ) : (
                <></>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="mb-4 rounded px-8 pb-8 pt-6">
        <div className="flex justify-between">
          <TotalMessages
            totalMessages={totalsByDisposition.delivered || 0}
            expectedTotal={queueCounts.fullCount || 0}
          />
          <ExportButton isBusy={state !== "idle"} />
        </div>
        <DispositionBreakdown
          results={results}
          totalCalls={totalOfAllResults || 0}
          expectedTotal={totalOfAllResults || 0}
        />
        <KeyMessageMetrics
          results={results}
          expectedTotal={totalOfAllResults || 0}
        />
      </div>
    </div>
  );
};

export default MessageResultsScreen;
