export function TotalCalls({
  totalCalls,
  expectedTotal,
}: {
  totalCalls: number;
  expectedTotal: number;
}) {
  return (
    <div className="flex flex-col">
      <h2 className="mb-0 text-2xl font-semibold">Total Calls: {totalCalls}</h2>
      <h3 className="mb-4 text-xl font-light">of {expectedTotal}</h3>
    </div>
  );
}
