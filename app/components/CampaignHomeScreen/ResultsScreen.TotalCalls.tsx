export const TotalCalls = ({
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

export const TotalMessages = ({
  totalMessages = 0,
  expectedTotal = 0
}:{
  totalMessages: number;
  expectedTotal: number;
}) => (
  <div className="flex flex-col">
  <h2 className="mb-0 text-2xl font-semibold">Total Messages: {totalMessages}</h2>
  <h3 className="mb-4 text-xl font-light">of {expectedTotal}</h3>
</div>
);
