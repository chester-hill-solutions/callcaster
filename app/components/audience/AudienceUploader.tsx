import { useState, useEffect } from "react";
import { useParams, useNavigate, useSubmit, useFetcher } from "@remix-run/react";
import { parse } from "csv-parse/sync";
import { MdAdd, MdClose, MdCheck, MdArrowForward } from "react-icons/md";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useSupabaseRealtimeSubscription } from "@/hooks/realtime/useSupabaseRealtime";
import { Contact } from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { useInterval } from "@/hooks/utils/useInterval";

const VALID_HEADERS = ["firstname", "surname", "phone", "email", "opt_out", "address", "city", "province", "postal", "country", "carrier", "other_data"];

// Parse CSV with columns option for better mapping
const parseCSV = (csvString: string) => {
  try {
    const records = parse(csvString, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    const headers = parseCSVHeaders(Object.keys(records[0] || {}));
    const contacts = parseCSVData(records, headers);
    return { headers, contacts };
  } catch (error) {
    console.error("Error parsing CSV:", error);
    throw new Error("Failed to parse CSV file");
  }
};

const parseCSVHeaders = (unparsedHeaders: string[]) => {
  return unparsedHeaders.map((header) => header.toLowerCase().trim());
};

type CSVRecord = Record<string, string | number | null | undefined>;

const parseCSVData = (records: CSVRecord[], headers: string[]) => {
  return records.map((record) => {
    const contact: Record<string, string> = {};
    headers.forEach((header) => {
      const recordKey = Object.keys(record).find(
        key => key.toLowerCase() === header.toLowerCase()
      );
      contact[header] = recordKey ? String(record[recordKey] || '') : '';
    });
    return contact;
  });
};

const sanitizeValue = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  const str = String(value).trim();
  // Remove null bytes and other problematic characters
  return str.replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F\uFFFD]/g, '');
};

type AudienceUploaderProps = {
  audienceName?: string;
  existingAudienceId?: string;
  supabase: SupabaseClient<Database>;
  onUploadComplete?: (audienceId: string) => void;
};

// Add a type for the fetcher state
type FetcherState = "idle" | "submitting" | "loading";

export default function AudienceUploader({ 
  audienceName = "", 
  existingAudienceId,
  supabase,
  onUploadComplete 
}: AudienceUploaderProps) {
  const params = useParams();
  const workspaceId = params.id;
  const navigate = useNavigate();
  
  // File upload state
  const [pendingFileName, setPendingFileName] = useState("");
  const [pendingContactHeaders, setPendingContactHeaders] = useState<string[]>([]);
  const [headerMapping, setHeaderMapping] = useState<Record<string, string>>({});
  const [splitNameColumn, setSplitNameColumn] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<Contact[]>([]);
  const [fullContactData, setFullContactData] = useState<Record<string, string>[]>([]);
  const [isHeaderMappingConfirmed, setIsHeaderMappingConfirmed] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  
  // Upload progress state
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [audienceId, setAudienceId] = useState<string | null>(existingAudienceId || null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [totalContacts, setTotalContacts] = useState(0);
  const [processedContacts, setProcessedContacts] = useState(0);
  
  // Use fetcher instead of submit for better control over the submission and response
  const fetcher = useFetcher();

  // Add new state for status polling
  const [statusPollingEnabled, setStatusPollingEnabled] = useState(false);
  const [currentUploadId, setCurrentUploadId] = useState<number | null>(null);

  // Listen for changes to the audience status
  useSupabaseRealtimeSubscription({
    supabase,
    table: "audience",
    filter: audienceId ? `id=eq.${audienceId}` : undefined,
    onChange: (payload) => {
      if (payload.eventType === "UPDATE" && payload.new) {
        const newData = payload.new as {
          status?: string;
          total_contacts?: number;
          processed_contacts?: number;
          id?: string | number;
          error_message?: string;
        };
        setUploadStatus(newData.status || null);
        setTotalContacts(newData.total_contacts || 0);
        setProcessedContacts(newData.processed_contacts || 0);
        
        if (newData.status === "completed") {
          setUploadProgress(100);
          if (onUploadComplete && newData.id) {
            onUploadComplete(String(newData.id));
          }
        } else if (newData.status === "error") {
          setUploadError(newData.error_message || "An error occurred during upload");
        } else if (newData.total_contacts && newData.total_contacts > 0 && newData.processed_contacts !== undefined) {
          const progress = Math.round((newData.processed_contacts / newData.total_contacts) * 100);
          setUploadProgress(progress);
        }
      }
    },
  });

  // Status polling interval
  useInterval(
    async () => {
      if (!currentUploadId || !workspaceId) return;

      try {
        const response = await fetch(
          `/api/audience-upload-status?uploadId=${currentUploadId}&workspaceId=${workspaceId}`
        );
        const data = await response.json();

        if (data.error) {
          setUploadError(data.error);
          setStatusPollingEnabled(false);
          return;
        }

        if (data.status === "completed") {
          setUploadStatus("completed");
          setUploadProgress(100);
          setStatusPollingEnabled(false);
          if (onUploadComplete) {
            onUploadComplete(data.audienceId.toString());
          }
        } else if (data.status === "error") {
          setUploadError(data.error_message || "An error occurred during upload");
          setUploadStatus("error");
          setStatusPollingEnabled(false);
        } else {
          setUploadStatus(data.status);
          setTotalContacts(data.total_contacts || 0);
          setProcessedContacts(data.processed_contacts || 0);
          if (data.total_contacts > 0) {
            const progress = Math.round((data.processed_contacts / data.total_contacts) * 100);
            setUploadProgress(progress);
          }
        }
      } catch (error) {
        console.error("Error polling status:", error);
        setUploadError("Error checking upload status");
        setStatusPollingEnabled(false);
      }
    },
    statusPollingEnabled ? 2000 : null // Poll every 2 seconds when enabled
  );

  const displayFileToUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const filePath = e.target.value;
    const file = e.target.files?.[0];
    if (!file) return;
    
    setSelectedFile(file); // Store the file in state
    
    const data = await file.text();
    if (!data) return;
    const { contacts, headers } = parseCSV(data);

    // Store full contact data
    setFullContactData(contacts);

    // Create preview with first 5 rows
    const cleanPreviewData = contacts.slice(0, 5).map(contact => {
      const cleanContact: Record<string, string> = {};
      headers.forEach(header => {
        const value = contact[header];
        cleanContact[header] = value === 'null' || value === undefined || value === null ? '' : String(value);
      });
      return cleanContact;
    });

    const nameColumnHeader = headers.find(h =>
      h.toLowerCase() === 'name' || h.toLowerCase() === 'full name'
    );

    const initialMapping = headers.reduce((acc, header) => {
      const normalizedHeader = header.toLowerCase().trim();
      if (nameColumnHeader && header === nameColumnHeader) {
        setSplitNameColumn(header);
        acc[header] = "name";
      } else if (VALID_HEADERS.includes(normalizedHeader)) {
        acc[header] = normalizedHeader;
      } else {
        acc[header] = "other_data";
      }
      return acc;
    }, {} as Record<string, string>);

    setHeaderMapping(initialMapping);
    setPendingFileName(filePath.split("\\").at(-1) || "");
    setPendingContactHeaders(headers);
    setPreviewData(cleanPreviewData as unknown as Contact[]);
    setIsHeaderMappingConfirmed(false);
  };

  const updateHeaderMapping = (originalHeader: string, newMapping: string) => {
    setHeaderMapping(prev => ({
      ...prev,
      [originalHeader]: newMapping
    }));
  };

  const handleRemoveFile = () => {
    setPendingFileName("");
    setSelectedFile(null); // Clear the stored file
    const fileInput = document.getElementById("contacts") as HTMLInputElement;
    if (fileInput) {
      fileInput.value = "";
    }
    setIsHeaderMappingConfirmed(false);
  };

  const handleConfirmMapping = () => {
    setIsHeaderMappingConfirmed(true);
  };

  const handleResetMapping = () => {
    setIsHeaderMappingConfirmed(false);
  };

  const handleUploadContacts = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!pendingFileName || !isHeaderMappingConfirmed) {
      return;
    }
    
    setUploadError(null);
    setUploadStatus("submitting");
    
    try {
      if (!selectedFile) {
        throw new Error("No file selected");
      }
      
      const formData = new FormData();
      formData.append("workspace_id", workspaceId as string);
      
      if (existingAudienceId) {
        formData.append("audience_id", existingAudienceId);
      } else {
        formData.append("audience_name", audienceName);
      }
      
      formData.append("contacts", selectedFile);
      formData.append("header_mapping", JSON.stringify(headerMapping));
      if (splitNameColumn) {
        formData.append("split_name_column", splitNameColumn);
      }
      
      const response = await fetch("/api/audience-upload", {
        method: "POST",
        body: formData
      });
      
      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error);
      }
      
      // Start polling for status
      setCurrentUploadId(data.upload_id);
      setStatusPollingEnabled(true);
      setUploadStatus("processing");
      setAudienceId(data.audience_id);
      
    } catch (error) {
      console.error("Upload error:", error);
      setUploadError(error instanceof Error ? error.message : "An unexpected error occurred");
      setUploadStatus("error");
    }
  };

  // Handle fetcher state changes
  useEffect(() => {
    const currentState = fetcher.state as FetcherState;
    
    if (currentState === "submitting") {
      // Form is being submitted
      setUploadStatus("submitting");
    } else if (currentState === "loading") {
      // Transition from submitting to loading means the server has responded
      const data = fetcher.data as { error?: string; audience_id?: string; success?: boolean } | undefined;
      
      if (data?.error) {
        setUploadError(data.error);
        setUploadStatus("error");
      } else if (data?.audience_id) {
        setAudienceId(data.audience_id);
        setUploadStatus("processing");
      }
    }
  }, [fetcher.state, fetcher.data]);

  // Redirect to audience page when upload is complete
  useEffect(() => {
    if (uploadStatus === "completed" && audienceId && !onUploadComplete) {
      // Wait a moment to show the completion state
      const timer = setTimeout(() => {
        navigate(`/workspaces/${workspaceId}/audiences/${audienceId}`);
      }, 2000);
      
      return () => clearTimeout(timer);
    }
  }, [uploadStatus, audienceId, workspaceId, navigate, onUploadComplete]);

  return (
    <div className="space-y-6">
      <div className="block text-sm font-medium text-gray-700 dark:text-gray-200">
        <div>
          <div className="flex items-baseline gap-4">
            <div>Upload contacts (.csv file):</div>
            <div className="flex items-center gap-2">
              <input
                type="file"
                name="contacts"
                id="contacts"
                accept=".csv"
                className="hidden"
                onChange={displayFileToUpload}
              />
              <Button asChild variant="outline" size="icon">
                <label htmlFor="contacts" className="cursor-pointer">
                  <MdAdd />
                </label>
              </Button>
            </div>
          </div>
          {pendingFileName && (
            <div className="flex items-center gap-2">
              <span className="text-sm">{pendingFileName}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={handleRemoveFile}
              >
                <MdClose />
              </Button>
            </div>
          )}
        </div>
      </div>
      
      {pendingFileName && (
        <div className="rounded-lg border p-4 bg-zinc-100 dark:bg-zinc-900">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium text-zinc-900 dark:text-white">Map CSV Headers</h3>
            {!isHeaderMappingConfirmed ? (
              <Button
                onClick={handleConfirmMapping}
                className="bg-brand-primary text-white hover:bg-brand-secondary"
              >
                Confirm Mapping
              </Button>
            ) : (
              <Button
                onClick={handleResetMapping}
                variant="outline"
                className="text-red-500 border-red-500 hover:bg-red-50"
              >
                Reset Mapping
              </Button>
            )}
          </div>

          {!isHeaderMappingConfirmed ? (
            <>
              <Table className="w-full">
                <TableHeader>
                  <TableRow>
                    <TableHead>CSV Header</TableHead>
                    <TableHead>Maps To</TableHead>
                    {splitNameColumn && <TableHead>Options</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingContactHeaders.map(header => (
                    <TableRow key={header}>
                      <TableCell>{header}</TableCell>
                      <TableCell>
                        <select
                          className="rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-zinc-800"
                          value={headerMapping[header] || 'other_data'}
                          onChange={(e) => updateHeaderMapping(header, e.target.value)}
                        >
                          {VALID_HEADERS.map(validHeader => (
                            <option key={validHeader} value={validHeader}>
                              {validHeader}
                            </option>
                          ))}
                          <option value="name">name (will be split)</option>
                        </select>
                      </TableCell>
                      {splitNameColumn && header === splitNameColumn && (
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              id="split-name"
                              className="rounded border-gray-300"
                              checked={Boolean(splitNameColumn)}
                              onChange={(e) => setSplitNameColumn(e.target.checked ? header : null)}
                            />
                            <label htmlFor="split-name">Split into First/Last Name</label>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="mt-4 rounded-lg border p-4">
                <h3 className="mb-4 font-medium text-zinc-900 dark:text-white">Data Preview (First 5 rows)</h3>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {pendingContactHeaders.map(header => (
                          <TableHead key={header} className="whitespace-nowrap px-3 py-2">
                            {header}
                            <div className="text-xs text-gray-500">
                              → {headerMapping[header]}
                            </div>
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {previewData.map((row, idx) => (
                        <TableRow key={idx}>
                          {pendingContactHeaders.map(header => {
                            const rowRecord = row as unknown as Record<string, unknown>;
                            const value = rowRecord[header];
                            return (
                              <TableCell key={header} className="whitespace-nowrap px-3 py-2">
                                {String(value || '')}
                              </TableCell>
                            );
                          })}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </>
          ) : (
            <div className="space-y-2">
              <div className="text-sm text-gray-600 dark:text-gray-300">
                ✓ {fullContactData.length} contacts ready to upload
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-300">
                ✓ Headers mapped successfully
              </div>
              {splitNameColumn && (
                <div className="text-sm text-gray-600 dark:text-gray-300">
                  ✓ Names will be split into First/Last name
                </div>
              )}
            </div>
          )}
        </div>
      )}
      
      {uploadError && (
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{uploadError}</AlertDescription>
        </Alert>
      )}
      
      {uploadStatus && (
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium">
              {uploadStatus === "processing" ? "Processing..." : 
               uploadStatus === "completed" ? "Completed!" : 
               uploadStatus === "submitting" ? "Submitting..." :
               uploadStatus === "error" ? "Error" : "Preparing..."}
            </span>
            <span className="text-sm">
              {processedContacts} / {totalContacts} contacts
            </span>
          </div>
          <Progress value={uploadProgress} className="h-2" />
        </div>
      )}
      
      {(fetcher.state as FetcherState) === "idle" && !uploadStatus ? (
        <div className="flex justify-end">
          <Button
            onClick={handleUploadContacts}
            disabled={!pendingFileName || !isHeaderMappingConfirmed || (fetcher.state as FetcherState) !== "idle"}
            className="bg-brand-primary text-white hover:bg-brand-secondary"
          >
            {(fetcher.state as FetcherState) !== "idle" ? "Uploading..." : "Start Upload"}
          </Button>
        </div>
      ) : (
        <div className="flex justify-center">
          {uploadStatus === "completed" ? (
            <div className="text-center text-green-500">
              <MdCheck className="mx-auto text-4xl" />
              <p>Upload completed successfully!</p>
              {!onUploadComplete && <p className="text-sm">Redirecting to audience page...</p>}
            </div>
          ) : uploadStatus === "error" ? (
            <Button
              type="button"
              onClick={() => {
                setUploadStatus(null);
                setUploadError(null);
              }}
              variant="outline"
              className="mt-4"
            >
              Try Again
            </Button>
          ) : (
            <p className="text-sm text-gray-600 italic">
              Please wait while your contacts are being processed...
            </p>
          )}
        </div>
      )}
    </div>
  );
} 