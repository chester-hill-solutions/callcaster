import { ResultsScreenProps } from "~/lib/database.types";
import { TotalCalls } from "./ResultsScreen.TotalCalls";
import { ExportButton } from "./ResultsScreen.ExportButton";
import { DispositionBreakdown } from "./ResultsScreen.Disposition";
import { KeyMetrics } from "./ResultsScreen.KeyMetrics";
import { NavLink } from "@remix-run/react";
import { Button } from "./ui/button";
import { useSubmit } from "@remix-run/react";

const startCampaign = (submit, campaign_id, user_id) => {
  submit(
    { campaign_id, user_id },
    {
      action: "/api/initiate-ivr",
      method: "POST",
      navigate: false,
      encType: "application/json",
    },
  );
};

const ResultsScreen = ({
  totalCalls = 0,
  results = [],
  expectedTotal = 0,
  type,
  dial_type,
  handleNavlinkStyles,
  hasAccess,
  campaign_id,
  user_id,
}: ResultsScreenProps) => {
  const submit = useSubmit();
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between">
        <h1 className="mb-6 text-3xl font-bold">Call Campaign Results</h1>
        {hasAccess && (
          <div>
            {type !== "live_call" && (
              <Button
                onClick={() => startCampaign(submit, campaign_id, user_id)}
              >
                Start Campaign
              </Button>
            )}
          </div>
        )}
      </div>
      <div className="mb-4 rounded px-8 pb-8 pt-6">
        <div className="flex justify-between">
          <TotalCalls totalCalls={totalCalls} expectedTotal={expectedTotal} />
          <ExportButton />
        </div>
        <DispositionBreakdown
          results={results}
          totalCalls={totalCalls}
          expectedTotal={expectedTotal}
        />
        <KeyMetrics
          results={results}
          totalCalls={totalCalls}
          expectedTotal={expectedTotal}
        />
      </div>
    </div>
  );
};

export default ResultsScreen;
