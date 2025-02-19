import { ResultsScreenProps, DispositionResult } from "~/lib/types";
import { TotalMessages } from "./ResultsScreen.TotalCalls";
import { ExportButton } from "./ResultsScreen.ExportButton";
import { DispositionBreakdown } from "./ResultsScreen.Disposition";
import { KeyMessageMetrics } from "./ResultsScreen.KeyMetrics";
import { NavLink, useNavigation } from "@remix-run/react";

interface MessageResultsScreenProps extends ResultsScreenProps {
  type?: string;
  handleNavlinkStyles?: (isActive: boolean, isPending: boolean) => string;
  hasAccess?: boolean;
}
type Disposition = "delivered" | "failed" | "pending" | "sending" | "sent" | "undelivered" | "unknown";

const getTotalsByDisposition = (results: DispositionResult[]) => {
  return results.reduce((acc, result) => {
    acc[result.disposition as Disposition] = (acc[result.disposition as Disposition] || 0) + result.count;
    return acc;
  }, {} as Record<Disposition, number>);
};

const MessageResultsScreen = ({
  results = [],
  type,
  handleNavlinkStyles = () => "",
  hasAccess = false,
}: MessageResultsScreenProps) => {
  const {state} = useNavigation();
  const totalsByDisposition = getTotalsByDisposition(results);
  const totalOfAllResults = results.reduce((acc, result) => acc + result.count, 0);
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between">
        <h1 className="mb-6 text-3xl font-bold">Message Campaign Results</h1>
        <div className="">
          {hasAccess && (
            <div>
              {type === "live_call" || !type ? (
                <NavLink
                  className={({ isActive, isPending }) =>
                    handleNavlinkStyles(isActive, isPending)
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
            expectedTotal={totalOfAllResults || 0}
          />
          <ExportButton isBusy={state !== "idle"}/>
        </div>
        <DispositionBreakdown
          results={results}
          totalCalls={totalOfAllResults || 0}
          expectedTotal={totalOfAllResults || 0}
        />
        <KeyMessageMetrics
          results={results}
          totalCalls={totalsByDisposition.sent || 0}
          expectedTotal={totalOfAllResults || 0}
        />
      </div>
    </div>
  );
};

export default MessageResultsScreen;
