import { DispositionResult } from "~/lib/types";

export const KeyMetrics = ({ results, totalCalls }: { results: DispositionResult[]; totalCalls: number }) => {
  const getRate = (disposition: string): string => {
    const count =
      results?.find((d) => d.disposition === disposition)?.count || 0;
    const rate = (count / totalCalls) * 100;

    return isNaN(rate) || !isFinite(rate) ? "0.0" : rate.toFixed(1);
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

export const KeyMessageMetrics = ({
  results,
  totalCalls,
  expectedTotal,
}: {
  results: DispositionResult[];
  totalCalls: number;
  expectedTotal: number;
}) => {
  const getRate = (disposition: string): string => {
    const count =
      results?.find((d) => d.disposition === disposition)?.count || 0;
    return ((count /  expectedTotal ) * 100).toFixed(1);
  };

  return (
    <div className="mt-8">
      <h3 className="mb-4 text-xl font-semibold">Key Metrics</h3>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-lg bg-blue-100 p-4">
          <p className="text-lg font-semibold text-blue-500">Delivered Rate</p>
          <p className="text-3xl font-bold text-blue-800">{getRate("delivered")}%</p>
        </div>
        <div className="rounded-lg bg-red-100 p-4">
          <p className="text-lg font-semibold text-red-500">Failed Rate</p>
          <p className="text-3xl font-bold text-red-800">
            {getRate("undelivered")}%
          </p>
        </div>
      </div>
    </div>
  );
};
