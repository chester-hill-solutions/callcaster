export const TotalCalls = ({
  totalCalls,
  expectedTotal,
  label = "Total Calls",
}: {
  totalCalls: number;
  expectedTotal: number;
  label?: string;
}) => (
  <div className="flex flex-col">
    <h2 className="mb-0 text-2xl font-semibold">
      {label}: {totalCalls}
    </h2>
    <h3 className="mb-4 text-xl font-light">of {expectedTotal}</h3>
  </div>
);

export const TotalMessages = ({
  totalMessages = 0,
  expectedTotal,
}: {
  totalMessages: number;
  expectedTotal?: number;
}) => (
  <div className="flex flex-col">
    <h2 className="mb-0 text-2xl font-semibold">
      Total Messages: {totalMessages}
    </h2>
    {expectedTotal !== undefined && (
      <h3 className="mb-4 text-xl font-light">of {expectedTotal}</h3>
    )}
  </div>
);
