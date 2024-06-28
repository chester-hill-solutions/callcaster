import { ResultsScreenProps } from "~/lib/database.types";

export const KeyMetrics = ({ results, totalCalls }: ResultsScreenProps) => {
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
  
export const KeyMessageMetrics = ({ results, totalCalls }: ResultsScreenProps) => {
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
            <p className="text-lg font-semibold text-blue-500">Delivered Rate</p>
            <p className="text-3xl font-bold text-blue-800">
              {getRate("sent")}%
            </p>
          </div>
          <div className="rounded-lg bg-red-100 p-4">
            <p className="text-lg font-semibold text-red-500">Failed Rate</p>
            <p className="text-3xl font-bold text-red-800">
              {getRate("failed")}%
            </p>
          </div>
        </div>
      </div>
    );
  };