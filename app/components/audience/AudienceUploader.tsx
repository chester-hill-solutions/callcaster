import { useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router";
import { parse } from "csv-parse/sync";
import { MdAdd, MdClose, MdCheck } from "react-icons/md";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useWorkspaceEventSubscription } from "@/hooks/realtime/useWorkspaceRealtime";
import { Contact } from "@/lib/types";
import { logger } from "@/lib/logger.client";
import type { Database } from "@/lib/db-types";
import { useInterval } from "@/hooks/utils/useInterval";
import { useTimeoutFn } from "@/hooks/utils/useTimeoutFn";
import {
  CONTACT_IMPORT_LABELS,
  CONTACT_IMPORT_TARGETS,
  suggestContactImportMapping,
  validateContactImportMapping,
} from "../../../shared/contact-import-headers";

export const VALID_HEADERS = CONTACT_IMPORT_TARGETS.filter(
  (target) => target !== "name",
);

// Parse CSV with columns option for better mapping
export const parseCSV = (csvString: string) => {
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
    logger.error("Error parsing CSV:", error);
    throw new Error("Failed to parse CSV file");
  }
};

export const parseCSVHeaders = (unparsedHeaders: string[]) => {
  return unparsedHeaders.map((header) => header.toLowerCase().trim());
};

type CSVRecord = Record<string, string | number | null | undefined>;

export const parseCSVData = (records: CSVRecord[], headers: string[]) => {
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

// Rows processed per chunk when parsing off the main thread. Small enough that
// each chunk's parse + object-mapping work stays well under a frame budget,
// large enough to keep chunk-loop overhead negligible for typical uploads.
const CSV_ASYNC_CHUNK_ROWS = 2000;

const yieldToMainThread = () =>
  new Promise<void>((resolve) => setTimeout(resolve, 0));

// Splits raw CSV text into row-strings without ever cutting through a quoted
// field (which may itself contain embedded newlines). This lets us hand the
// underlying (still-synchronous) csv-parse `parse()` call small batches of
// rows instead of the whole file at once, so we can yield to the browser
// between batches and avoid freezing the UI on large uploads.
const splitCsvLines = (csvString: string): string[] => {
  const lines: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < csvString.length; i++) {
    const char = csvString[i];
    if (char === '"') {
      // Toggles on every quote, including both quotes of an escaped `""`,
      // so quote state is preserved correctly across escaped quotes.
      inQuotes = !inQuotes;
      current += char;
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && csvString[i + 1] === "\n") {
        i++;
      }
      lines.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  if (current.length > 0) {
    lines.push(current);
  }
  return lines;
};

// Non-blocking counterpart to `parseCSV` used for the actual upload flow.
// Produces the exact same `{ headers, contacts }` shape, but parses the file
// in row batches with a yield to the event loop between each one, so large
// CSVs don't freeze scrolling/input while they're being read.
export const parseCSVAsync = async (
  csvString: string,
): Promise<{ headers: string[]; contacts: Record<string, string>[] }> => {
  try {
    const lines = splitCsvLines(csvString).filter((line) => line.length > 0);
    if (lines.length === 0) {
      return { headers: [], contacts: [] };
    }

    const [headerLine, ...dataLines] = lines;
    if (headerLine === undefined) {
      return { headers: [], contacts: [] };
    }
    const [rawHeaderRow] = parse(headerLine, {
      columns: false,
      skip_empty_lines: true,
      trim: true,
    }) as string[][];

    const records: CSVRecord[] = [];
    for (let i = 0; i < dataLines.length; i += CSV_ASYNC_CHUNK_ROWS) {
      const batch = dataLines.slice(i, i + CSV_ASYNC_CHUNK_ROWS);
      const batchRecords = parse(batch.join("\n"), {
        columns: rawHeaderRow,
        skip_empty_lines: true,
        trim: true,
      }) as CSVRecord[];
      records.push(...batchRecords);
      // Only yield when more batches remain — single-chunk files (the common
      // case) stay on the microtask queue and don't defer a frame needlessly.
      if (i + CSV_ASYNC_CHUNK_ROWS < dataLines.length) {
        await yieldToMainThread();
      }
    }

    const headers = (rawHeaderRow ?? []).map((header) => header.trim());
    const contacts = parseCSVData(records, headers);
    return { headers, contacts };
  } catch (error) {
    logger.error("Error parsing CSV:", error);
    throw new Error("Failed to parse CSV file");
  }
};

type AudienceUploaderProps = {
  audienceName?: string;
  existingAudienceId?: string;
  campaignId?: string;
  returnTo?: string | null;
  onUploadComplete?: (audienceId: string) => void;
};

export default function AudienceUploader({ 
  audienceName = "", 
  existingAudienceId,
  campaignId,
  returnTo,
    onUploadComplete 
}: AudienceUploaderProps) {
  const params = useParams();
  const workspaceId = params["id"];
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
  const [uploadWarning, setUploadWarning] = useState<string | null>(null);
  const [audienceId, setAudienceId] = useState<string | null>(existingAudienceId || null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [totalContacts, setTotalContacts] = useState(0);
  const [processedContacts, setProcessedContacts] = useState(0);
  
  // Add new state for status polling
  const [statusPollingEnabled, setStatusPollingEnabled] = useState(false);
  const [currentUploadId, setCurrentUploadId] = useState<number | null>(null);
  const mappingIssues = useMemo(
    () => validateContactImportMapping(headerMapping),
    [headerMapping],
  );
  const hasBlockingMappingIssue = mappingIssues.some((issue) => issue.blocking);

  const scheduleRedirect = useTimeoutFn();

  // Transient status-refresh failures must not become terminal upload errors —
  // the background import may still be running. Keep polling with a warning.
  const registerPollFailure = () => {
    setUploadWarning("Live progress is delayed. Retrying automatically...");
  };

  const applyUploadState = (nextState: {
    status?: string | null;
    total_contacts?: number | null;
    processed_contacts?: number | null;
    error_message?: string | null;
    audience_id?: string | number | null;
    stage?: string | null;
  }) => {
    const nextStatus = nextState.status || null;
    const serverTotal =
      typeof nextState.total_contacts === "number" ? nextState.total_contacts : null;
    const serverProcessed =
      typeof nextState.processed_contacts === "number"
        ? nextState.processed_contacts
        : null;

    setUploadStatus(nextStatus);

    // Prefer server totals once available; keep client-seeded totals while the
    // server still reports 0 (upload row created but parser not finished).
    if (serverTotal != null && serverTotal > 0) {
      setTotalContacts(serverTotal);
      if (serverProcessed != null) {
        setProcessedContacts(serverProcessed);
        setUploadProgress(Math.round((serverProcessed / serverTotal) * 100));
      }
    } else if (serverProcessed != null) {
      setProcessedContacts(serverProcessed);
      if (totalContacts > 0) {
        setUploadProgress(Math.round((serverProcessed / totalContacts) * 100));
      }
    }

    if (typeof nextState.audience_id !== "undefined" && nextState.audience_id !== null) {
      setAudienceId(String(nextState.audience_id));
    }

    if (nextState.stage) {
      setUploadWarning(null);
    }

    if (nextStatus === "completed") {
      setUploadProgress(100);
      setStatusPollingEnabled(false);
      setUploadWarning(null);
      if (onUploadComplete && nextState.audience_id) {
        onUploadComplete(String(nextState.audience_id));
      } else if (!onUploadComplete) {
        const completedAudienceId =
          nextState.audience_id != null ? String(nextState.audience_id) : audienceId;
        if (completedAudienceId) {
          // Wait a moment to show the completion state before redirecting
          scheduleRedirect(2000, () => {
            navigate(
              returnTo ??
                `/workspaces/${workspaceId}/audiences/${completedAudienceId}`,
            );
          });
        }
      }
    }

    if (nextStatus === "error") {
      setUploadError(nextState.error_message || "An error occurred during upload");
      setUploadWarning(null);
      setStatusPollingEnabled(false);
    }
  };

  // Listen for changes to the upload record so the UI follows audience_upload directly.
  useWorkspaceEventSubscription({
    workspaceId: workspaceId ?? "",
    table: "audience_upload",
    ...(currentUploadId ? { filter: `id=eq.${currentUploadId}` } : {}),
    onChange: (payload) => {
      if (payload.eventType === "UPDATE" && payload.new) {
        const newData = payload.new as {
          status?: string;
          total_contacts?: number;
          processed_contacts?: number;
          audience_id?: string | number;
          error_message?: string;
        };
        applyUploadState(newData);
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

        type UploadStatusResponse = {
          error?: string;
          status?: string;
          total_contacts?: number;
          processed_contacts?: number;
          error_message?: string;
          audience_id?: string | number;
          stage?: string;
        };
        let data: UploadStatusResponse | null = null;
        try {
          data = (await response.json()) as UploadStatusResponse;
        } catch (parseError) {
          logger.error("Error parsing upload status response:", parseError);
          registerPollFailure();
          return;
        }

        // HTTP/auth failures and endpoint errors are transient for the UI —
        // only an upload record with status "error" is terminal.
        if (!response.ok || data?.error) {
          registerPollFailure();
          return;
        }

        setUploadWarning(null);
        applyUploadState(data ?? {});
      } catch (error) {
        logger.error("Error polling status:", error);
        registerPollFailure();
      }
    },
    statusPollingEnabled ? 5000 : null // QC-style 5s poll fallback while processing (#1078)
  );

  const displayFileToUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setSelectedFile(file); // Store the file in state
    
    const data = await file.text();
    if (!data) return;
    // Chunked + yielding parse so large CSVs don't block the main thread.
    const { contacts, headers } = await parseCSVAsync(data);

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

    const initialMapping = suggestContactImportMapping(headers);
    const nameColumnHeader = headers.find(
      (header) => initialMapping[header] === "name",
    );
    setSplitNameColumn(nameColumnHeader ?? null);

    setHeaderMapping(initialMapping);
    setPendingFileName(file.name);
    setPendingContactHeaders(headers);
    setPreviewData(cleanPreviewData as unknown as Contact[]);
    setIsHeaderMappingConfirmed(false);
  };

  const updateHeaderMapping = (originalHeader: string, newMapping: string) => {
    setHeaderMapping(prev => ({
      ...prev,
      [originalHeader]: newMapping
    }));
    if (newMapping === "name") {
      setSplitNameColumn(originalHeader);
    } else if (splitNameColumn === originalHeader) {
      setSplitNameColumn(null);
    }
  };

  const handleRemoveFile = () => {
    setPendingFileName("");
    setSelectedFile(null); // Clear the stored file
    const fileInput = document.getElementById("contacts") as HTMLInputElement;
    fileInput.value = "";
    setIsHeaderMappingConfirmed(false);
  };

  const handleConfirmMapping = () => {
    if (hasBlockingMappingIssue) return;
    setIsHeaderMappingConfirmed(true);
  };

  const handleResetMapping = () => {
    setIsHeaderMappingConfirmed(false);
  };

  const handleUploadContacts = async (e: React.FormEvent) => {
    e.preventDefault();

    setUploadError(null);
    setUploadWarning(null);
    setUploadStatus("submitting");
    
    try {
      const formData = new FormData();
      formData.append("workspace_id", workspaceId as string);
      
      if (existingAudienceId) {
        formData.append("audience_id", existingAudienceId);
      } else {
        formData.append("audience_name", audienceName);
      }
      
      formData.append("contacts", selectedFile!);
      formData.append("header_mapping", JSON.stringify(headerMapping));
      if (campaignId) {
        formData.append("campaign_id", campaignId);
      }
      if (splitNameColumn) {
        formData.append("split_name_column", splitNameColumn);
      }
      
      const response = await fetch("/api/audience-upload", {
        method: "POST",
        body: formData
      });
      
      const data = await response.json();
      
      if (!response.ok || data.error) {
        throw new Error(data.error || "Upload request failed");
      }
      
      // Seed progress from the already-parsed CSV so the UI does not show
      // 0/0 while waiting for the first server status update.
      const seededTotal = fullContactData.length;
      setTotalContacts(seededTotal);
      setProcessedContacts(0);
      setUploadProgress(0);

      // Start polling for status
      setCurrentUploadId(data.upload_id);
      setStatusPollingEnabled(true);
      setUploadStatus("processing");
      setAudienceId(data.audience_id);
      
    } catch (error) {
      logger.error("Upload error:", error);
      setUploadError(error instanceof Error ? error.message : "An unexpected error occurred");
      setUploadStatus("error");
    }
  };

  return (
    <div className="space-y-6">
      <div className="block text-sm font-medium text-foreground">
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
              <Button asChild variant="outline" size="icon" aria-label="Choose a CSV file to upload">
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
                aria-label="Remove selected file"
                onClick={handleRemoveFile}
              >
                <MdClose />
              </Button>
            </div>
          )}
        </div>
      </div>
      
      {pendingFileName && (
        <div className="rounded-md border bg-muted/40 p-4">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-medium text-foreground">Map CSV Headers</h3>
            {!isHeaderMappingConfirmed ? (
              <Button
                onClick={handleConfirmMapping}
                disabled={hasBlockingMappingIssue}
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
                          value={headerMapping[header]}
                          onChange={(e) => updateHeaderMapping(header, e.target.value)}
                        >
                          {VALID_HEADERS.map(validHeader => (
                            <option key={validHeader} value={validHeader}>
                              {CONTACT_IMPORT_LABELS[validHeader]}
                            </option>
                          ))}
                          <option value="name">{CONTACT_IMPORT_LABELS.name} (split into names)</option>
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
                              onChange={() => setSplitNameColumn(null)}
                            />
                            <label htmlFor="split-name">Split into First/Last Name</label>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {mappingIssues.length > 0 ? (
                <div className="mt-4 space-y-2" aria-live="polite">
                  {mappingIssues.map((issue) => (
                    <Alert
                      key={`${issue.code}-${issue.headers.join("-")}`}
                      variant={issue.blocking ? "destructive" : "default"}
                    >
                      <AlertTitle>
                        Mapping needs attention
                      </AlertTitle>
                      <AlertDescription>{issue.message}</AlertDescription>
                    </Alert>
                  ))}
                </div>
              ) : null}

              <div className="mt-4 border-t border-border pt-4">
                <h3 className="mb-4 font-medium text-foreground">Data Preview (First 5 rows)</h3>
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {pendingContactHeaders.map(header => (
                          <TableHead key={header} className="whitespace-nowrap px-3 py-2">
                            {header}
                            <div className="text-xs text-muted-foreground">
                              → {headerMapping[header]}
                              {headerMapping[header]
                                ? ` (${CONTACT_IMPORT_LABELS[
                                    headerMapping[header] as keyof typeof CONTACT_IMPORT_LABELS
                                  ]})`
                                : ""}
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
              <div className="text-sm text-foreground">
                ✓ {fullContactData.length} contacts ready to upload
              </div>
              <div className="text-sm text-muted-foreground">
                ✓ Headers mapped successfully
              </div>
              {splitNameColumn && (
                <div className="text-sm text-muted-foreground">
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

      {uploadWarning && !uploadError && (
        <Alert>
          <AlertTitle>Upload still running</AlertTitle>
          <AlertDescription>{uploadWarning}</AlertDescription>
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
      
      {!uploadStatus ? (
        <div className="flex justify-end">
          <Button
            onClick={handleUploadContacts}
            disabled={!pendingFileName || !isHeaderMappingConfirmed || hasBlockingMappingIssue}
            className="bg-brand-primary text-white hover:bg-brand-secondary"
          >
            Start Upload
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
                setUploadWarning(null);
              }}
              variant="outline"
              className="mt-4"
            >
              Try Again
            </Button>
          ) : (
            <p className="text-sm italic text-muted-foreground">
              Please wait while your contacts are being processed...
            </p>
          )}
        </div>
      )}
    </div>
  );
} 