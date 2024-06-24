import { Button } from "~/components/ui/button";
import { Form } from "@remix-run/react";
import { ResultsScreenProps } from "~/lib/database.types";

const dispositionColors: Record<string, string> = {
  voicemail: "bg-blue-500",
  completed: "bg-green-500",
  "no-answer": "bg-yellow-500",
  failed: "bg-red-500",
};

const TotalCalls = ({
  totalCalls,
  expectedTotal,
}: {
  totalCalls: number;
  expectedTotal: number;
}) => (
  <div className="flex flex-col">
    <h2 className="mb-0 text-2xl font-semibold">Total Calls: {totalCalls}</h2>
    <h3 className="mb-4 text-xl font-light">of {expectedTotal}</h3>
  </div>
);

const ExportButton = () => (
  <Form method="POST">
    <Button type="submit">Export Results</Button>
  </Form>
);

const DispositionBar = ({
  disposition,
  count,
  totalCalls,
  average_call_duration,
}: {
  disposition: string;
  count: number;
  totalCalls: number;
  average_call_duration: string;
}) => (
  <div key={disposition} className="mb-6">
    <div className="mb-1 flex items-center justify-between">
      <span className="text-sm font-medium capitalize">
        {disposition}
      </span>
      <span className="text-sm font-medium">
        {count} ({((count / totalCalls) * 100).toFixed(1)}%)
      </span>
    </div>
    <div className="h-2.5 w-full rounded-full bg-gray-200">
      <div
        className={`h-2.5 rounded-full ${dispositionColors[disposition] || "bg-gray-500"}`}
        style={{ width: `${(count / totalCalls) * 100}%` }}
      ></div>
    </div>
    {(disposition === "completed" || disposition === "voicemail") && (
      <div className="mt-1 text-sm">
        Avg. Duration: {average_call_duration.split(".").map((t,i) => (i === 1 ? t.slice(0,2) : t)).join('.')}
      </div>
    )}
  </div>
);

const DispositionBreakdown = ({ results, totalCalls }: ResultsScreenProps) => (
  <div className="mb-8">
    <h3 className="mb-4 text-xl font-semibold">Disposition Breakdown</h3>
    {results?.map((result) => (
      <DispositionBar
        key={result.disposition}
        {...result}
        totalCalls={totalCalls}
      />
    ))}
  </div>
);

const KeyMetrics = ({ results, totalCalls }: ResultsScreenProps) => {
  const getRate = (disposition: string): string => {
    const count =
      results?.find((d) => d.disposition === disposition)?.count || 0;
    return ((count / totalCalls) * 100).toFixed(1);
  };

  return (
    <div className="mt-8">
      <h3 className="mb-4 text-xl font-semibold">Key Metrics</h3>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-lg bg-blue-100 p-4">
          <p className="text-lg font-semibold text-blue-500">Completion Rate</p>
          <p className="text-3xl font-bold text-blue-800">
            {getRate("completed")}%
          </p>
        </div>
        <div className="rounded-lg bg-green-100 p-4">
          <p className="text-lg font-semibold text-green-500">Voicemail Rate</p>
          <p className="text-3xl font-bold text-green-800">
            {getRate("voicemail")}%
          </p>
        </div>
      </div>
    </div>
  );
};

const ResultsScreen = ({
  totalCalls = 0,
  results = [],
  expectedTotal = 0,
}: ResultsScreenProps) => {
  return (
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
  );
};

export default ResultsScreen;
