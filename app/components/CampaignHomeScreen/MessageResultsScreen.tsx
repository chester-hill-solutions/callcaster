import { ResultsScreenProps } from "~/lib/database.types";
import { TotalMessages } from "./ResultsScreen.TotalCalls";
import { ExportButton } from "./ResultsScreen.ExportButton";
import { DispositionBreakdown } from "./ResultsScreen.Disposition";
import { KeyMessageMetrics } from "./ResultsScreen.KeyMetrics";
import { NavLink } from "@remix-run/react";
import { Button } from "../ui/button";

const MessageResultsScreen = ({
  totalCalls = 0,
  results = [],
  expectedTotal = 0,
  type,
  dial_type,
  handleNavlinkStyles,
  hasAccess,
}: ResultsScreenProps) => {
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
                  to={`${dial_type || "call"}`}
                  relative="path"
                >
                  Join Campaign
                </NavLink>
              ) : (
                <Button>Start Campaign</Button>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="mb-4 rounded px-8 pb-8 pt-6">
        <div className="flex justify-between">
          <TotalMessages
            totalMessages={totalCalls}
            expectedTotal={expectedTotal}
          />
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
