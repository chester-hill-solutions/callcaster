import { DispositionResult } from "~/lib/types";

export const KeyMetrics = ({
  results,
  totalsByDisposition,
  totalOfAllResults
}: {
  results: DispositionResult[];
  totalsByDisposition: Record<string, number>;
  totalOfAllResults: number;
}) => {

  const getRate = (disposition: string): string => {
    if (!Array.isArray(results)) {
      return "0.0";
    }

    const count = totalsByDisposition[disposition] || 0;
    const rate = (count / totalOfAllResults) * 100;
    const formattedRate = isNaN(rate) || !isFinite(rate) ? "0.0" : rate.toFixed(1);
    return formattedRate;
  };
  const completionRate = getRate("completed");
  const voicemailRate = getRate("voicemail");
  return (
    <div className="mt-8">
      <h3 className="mb-4 text-xl font-semibold">Key Metrics</h3>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-lg bg-blue-100 p-4">
          <p className="text-lg font-semibold text-blue-500">Completion Rate</p>
          <p className="text-3xl font-bold text-blue-800">
            {completionRate}%
          </p>
        </div>
        <div className="rounded-lg bg-green-100 p-4">
          <p className="text-lg font-semibold text-green-500">Voicemail Rate</p>
          <p className="text-3xl font-bold text-green-800">
            {voicemailRate}%
          </p>
        </div>
      </div>
    </div>
  );
};

export const KeyMessageMetrics = ({
  results,
  totalsByDisposition,
  totalOfAllResults,
}: {
  results: DispositionResult[] | null;
  totalsByDisposition: Record<string, number> | null;
  totalOfAllResults: number;
}) => {
  const getRate = (disposition: string): string => {
    if (!Array.isArray(results) || !totalsByDisposition || !totalOfAllResults || !results.length) {
      return "0.0";
    }

    const count = totalsByDisposition?.[disposition] || 0;
    const rate = (count / totalOfAllResults) * 100;
    const formattedRate = isNaN(rate) || !isFinite(rate) ? "0.0" : rate.toFixed(1);
    return formattedRate;
  };
  const deliveredRate = getRate("delivered");
  const undeliveredRate = getRate("undelivered");

  return (
    <div className="mt-8">
      <h3 className="mb-4 text-xl font-semibold">Key Metrics</h3>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-lg bg-blue-100 p-4">
          <p className="text-lg font-semibold text-blue-500">Delivered Rate</p>
          <p className="text-3xl font-bold text-blue-800">{deliveredRate}%</p>
        </div>
        <div className="rounded-lg bg-red-100 p-4">
          <p className="text-lg font-semibold text-red-500">Failed Rate</p>
          <p className="text-3xl font-bold text-red-800">
            {undeliveredRate}%
          </p>
        </div>
      </div>
    </div>
  );
};
