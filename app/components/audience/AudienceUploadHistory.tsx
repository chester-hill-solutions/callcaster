import { useEffect, useState, useCallback } from "react";
import { useOutletContext } from "@remix-run/react";
import { formatDistanceToNow } from "date-fns";
import { useSupabaseRealtimeSubscription } from "@/hooks/realtime/useSupabaseRealtime";
import { Loader2 } from "lucide-react";
import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/lib/database.types";
import { logger } from "@/lib/logger.client";

interface AudienceUploadHistoryProps {
  audienceId: number;
}

interface AudienceUpload {
  id: number;
  audience_id: number;
  created_at: string;
  status: string;
  file_name: string | null;
  file_size: number | null;
  total_contacts: number;
  processed_contacts: number;
  processed_at: string | null;
  error_message: string | null;
}

type OutletContext = {
  supabase: SupabaseClient<Database>;
  env: {
    SUPABASE_URL: string;
    SUPABASE_KEY: string;
    BASE_URL: string;
  };
};

export default function AudienceUploadHistory({ audienceId }: AudienceUploadHistoryProps) {
  const { supabase } = useOutletContext<OutletContext>();
  const [uploads, setUploads] = useState<AudienceUpload[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUploads = useCallback(async () => {
    if (!audienceId) return;
    
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("audience_upload")
        .select("*")
        .eq("audience_id", audienceId)
        .order("created_at", { ascending: false });

      if (error) {
        throw error;
      }

      setUploads(data || []);
    } catch (err) {
      logger.error("Error fetching audience uploads:", err);
      setError(err instanceof Error ? err.message : "An error occurred while fetching uploads");
    } finally {
      setLoading(false);
    }
  }, [supabase, audienceId]);

  useEffect(() => {
    fetchUploads();
  }, [fetchUploads]);

  // Use the reusable subscription hook for real-time updates
  useSupabaseRealtimeSubscription({
    supabase,
    table: "audience_upload",
    filter: `audience_id=eq.${audienceId}`,
    onChange: (payload) => {
      // More efficient update that doesn't require a full refetch
      if (payload.eventType === "INSERT" && payload.new) {
        setUploads(prev => [payload.new as unknown as AudienceUpload, ...prev]);
      } else if (payload.eventType === "UPDATE" && payload.new) {
        const newData = payload.new as Partial<AudienceUpload> & { id?: number };
        setUploads(prev => 
          prev.map(upload => 
            newData.id && upload.id === newData.id ? { ...upload, ...newData } : upload
          )
        );
      } else if (payload.eventType === "DELETE") {
        setUploads(prev => prev.filter(upload => upload["id"] !== (payload.old as { id?: number })["id"]));
      }
    },
  });

  if (loading) {
    return (
      <div className="p-8 text-center">
        <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2 text-brand-primary" />
        <p>Loading upload history...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 border border-red-300 rounded-md bg-red-50 text-red-700">
        <p className="font-semibold">Error loading upload history</p>
        <p className="text-sm">{error}</p>
        <button 
          onClick={() => fetchUploads()} 
          className="mt-2 text-sm underline hover:text-red-900"
        >
          Try again
        </button>
      </div>
    );
  }

  if (uploads.length === 0) {
    return (
      <div className="p-6 text-center border border-gray-200 rounded-md bg-gray-50">
        <p className="text-gray-500">No upload history found for this audience</p>
      </div>
    );
  }

  function formatFileSize(bytes: number | null): string {
    if (bytes === null) return "Unknown";
    
    const units = ["B", "KB", "MB", "GB"];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }

  function getStatusBadgeClass(status: string): string {
    switch (status) {
      case "pending":
        return "bg-yellow-100 text-yellow-800 border-yellow-200";
      case "processing":
        return "bg-blue-100 text-blue-800 border-blue-200";
      case "completed":
        return "bg-green-100 text-green-800 border-green-200";
      case "error":
        return "bg-red-100 text-red-800 border-red-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  }

  function getProgressPercentage(upload: AudienceUpload): number {
    if (upload.status === "completed") return 100;
    if (upload.total_contacts === 0) return 0;
    return Math.round((upload.processed_contacts / upload.total_contacts) * 100);
  }

  return (
    <div className="mt-4 bg-white rounded-md border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Date
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                File
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Contacts
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Size
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {uploads.map((upload) => (
              <tr key={upload.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {formatDistanceToNow(new Date(upload.created_at), { addSuffix: true })}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {upload.file_name || "Unknown file"}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex flex-col">
                    <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full border ${getStatusBadgeClass(upload.status)}`}>
                      {upload.status}
                      {upload.status === "error" && upload.error_message && (
                        <span className="ml-2 text-red-500" title={upload.error_message}>⚠️</span>
                      )}
                    </span>
                    
                    {upload.status === "processing" && (
                      <div className="mt-1 h-1.5 w-full bg-gray-200 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-blue-500 rounded-full" 
                          style={{ width: `${getProgressPercentage(upload)}%` }}
                        ></div>
                      </div>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {upload.status === "completed" 
                    ? upload.total_contacts 
                    : `${upload.processed_contacts} / ${upload.total_contacts}`}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {formatFileSize(upload.file_size)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
} 