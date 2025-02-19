import { DispositionResult } from "~/lib/types";

const dispositionColors: Record<string, string> = {
  voicemail: "bg-blue-500",
  completed: "bg-green-500",
  delivered: "bg-green-500",
  "no-answer": "bg-yellow-500",
  failed: "bg-red-500",
  undelivered: "bg-red-400",
  unknown: "bg-gray-500",
};

const DispositionBar = ({
  disposition,
  count,
  totalCalls,
  average_call_duration,
  expectedTotal,
  }: DispositionResult & { totalCalls: number, expectedTotal: number }) => (
  <div key={disposition} className="mb-6">
    <div className="mb-1 flex items-center justify-between">
      <span className="text-sm font-medium capitalize">{disposition}</span>
      <span className="text-sm font-medium">
        {count} ({((count / (totalCalls || expectedTotal)) * 100).toFixed(1)}%)
      </span>
    </div>
    <div className="h-2.5 w-full rounded-full bg-gray-200">
      <div
        className={`h-2.5 rounded-full ${dispositionColors[disposition] || "bg-gray-500"}`}
        style={{ width: `${(count / (totalCalls || expectedTotal)) * 100}%` }}
      ></div>
    </div>
    {(disposition === "completed" || disposition === "voicemail") && (
      <div className="mt-1 text-sm">
        Avg. Duration:{" "}
        {average_call_duration
          ?.split(".")
          .map((t, i) => (i === 1 ? t.slice(0, 2) : t))
          .join(".")}
      </div>
    )}
  </div>
);

export const DispositionBreakdown = ({
  results,
  totalCalls,
  expectedTotal,
}: {
  results: DispositionResult[];
  totalCalls: number;
  expectedTotal: number;
}) => (
  <div className="mb-8">
    <h3 className="mb-4 text-xl font-semibold">Disposition Breakdown</h3>
    {results?.map(
      (result) =>
        result.disposition && result.disposition != "idle" && result.disposition != "No Disposition" && (
          <DispositionBar
            key={result.disposition}
            {...result}
            totalCalls={totalCalls}
            expectedTotal={expectedTotal}
          />
        ),
    )}
  </div>
);
