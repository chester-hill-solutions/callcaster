export interface AudienceUploadRequestBody {
  uploadId: number;
  audienceId: number;
  workspaceId: string;
  userId: string;
  fileContent: string; // base64 encoded CSV
  headerMapping: Record<string, string>;
  splitNameColumn: string | null;
}

/** Per-chunk yield used for large imports so the DB is not hammered. */
export const AUDIENCE_UPLOAD_CHUNK_DELAY_MS = 100;

/** Minimum interval between mid-flight progress status writes during import. */
export const AUDIENCE_UPLOAD_PROGRESS_NOTIFY_MS = 2500;

/** Default contact batch size for audience CSV import. */
export const AUDIENCE_UPLOAD_CHUNK_SIZE = 40;

/** Client/status poll interval while an upload is processing (QC-aligned). */
export const AUDIENCE_UPLOAD_PROCESSING_POLL_MS = 5000;

/**
 * Small uploads (single chunk) skip the artificial delay — a 1-row CSV
 * otherwise always waited at least 100ms after insert + dual status writes.
 */
export function audienceUploadChunkDelayMs(
  totalContacts: number,
  chunkSize: number = AUDIENCE_UPLOAD_CHUNK_SIZE,
): number {
  return totalContacts <= chunkSize ? 0 : AUDIENCE_UPLOAD_CHUNK_DELAY_MS;
}

/**
 * Throttle mid-flight status-sidecar writes for multi-chunk imports.
 * Single-chunk uploads skip mid-flight sidecar writes (finalization covers them).
 * Durable `processed_contacts` row updates are always written by the caller.
 */
export function audienceUploadShouldWriteStatus(args: {
  total: number;
  chunkSize?: number;
  isLastChunk: boolean;
  lastProgressAt: number;
  now?: number;
}): boolean {
  const chunkSize = args.chunkSize ?? AUDIENCE_UPLOAD_CHUNK_SIZE;
  if (args.total <= chunkSize) return false;
  const now = args.now ?? Date.now();
  return (
    args.isLastChunk ||
    now - args.lastProgressAt >= AUDIENCE_UPLOAD_PROGRESS_NOTIFY_MS
  );
}

export interface AudienceUploadContact {
  workspace: string;
  created_by: string;
  created_at: string;
  other_data: Array<Record<string, string>>;
  firstname?: string;
  surname?: string;
  upload_id?: number;
  [key: string]: unknown;
}

export function decodeBase64ToString(base64: string): string {
  return atob(base64);
}

// Parse a single CSV line, handling quoted fields correctly
export function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let currentField = "";
  let insideQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (nextChar === '"') {
        currentField += '"';
        i++;
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === "," && !insideQuotes) {
      result.push(currentField);
      currentField = "";
    } else {
      currentField += char;
    }
  }

  result.push(currentField);
  return result.map((field) => {
    const trimmed = field.trim();
    if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
      return trimmed.substring(1, trimmed.length - 1);
    }
    return trimmed;
  });
}

// Process CSV data with proper handling of quoted fields and embedded newlines.
export function parseCsvRecords(csvString: string): Record<string, string>[] {
  const lines: string[] = [];
  let currentLine = "";
  let insideQuotes = false;

  for (let i = 0; i < csvString.length; i++) {
    const char = csvString[i];
    const nextChar = csvString[i + 1];

    if (char === '"') {
      if (nextChar === '"') {
        currentLine += '"';
        i++;
      } else {
        insideQuotes = !insideQuotes;
        currentLine += char;
      }
    } else if (char === "\n" && !insideQuotes) {
      lines.push(currentLine);
      currentLine = "";
    } else if (char === "\r" && nextChar === "\n" && !insideQuotes) {
      lines.push(currentLine);
      currentLine = "";
      i++;
    } else {
      currentLine += char;
    }
  }

  if (currentLine) lines.push(currentLine);
  if (lines.length === 0) return [];

  const firstLine = lines[0];
  if (!firstLine) return [];
  const headers = parseCsvLine(firstLine);
  const records: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || !line.trim()) continue;
    const values = parseCsvLine(line);
    if (values.length !== headers.length) {
      while (values.length < headers.length) values.push("");
      if (values.length > headers.length) values.length = headers.length;
    }

    const record: Record<string, string> = {};
    headers.forEach((header, idx) => {
      record[header.trim()] = values[idx] ? values[idx].trim() : "";
    });
    records.push(record);
  }

  return records;
}

export function buildContactsFromRecords(args: {
  body: AudienceUploadRequestBody;
  records: Record<string, string>[];
  nowIso?: string;
}): AudienceUploadContact[] {
  const nowIso = args.nowIso ?? new Date().toISOString();

  return args.records.map((row) => {
    const contact: AudienceUploadContact = {
      workspace: args.body.workspaceId,
      created_by: args.body.userId,
      created_at: nowIso,
      other_data: [],
      upload_id: args.body.uploadId,
    };

    const normalizedRowHeaders = new Map<string, string>();
    Object.keys(row).forEach((header) => {
      normalizedRowHeaders.set(header.trim().toLowerCase(), header);
    });

    for (const [originalHeader, mappedField] of Object.entries(
      args.body.headerMapping,
    )) {
      const normalizedOriginalHeader = originalHeader.trim().toLowerCase();
      const actualHeader = normalizedRowHeaders.get(normalizedOriginalHeader);
      const value = actualHeader ? row[actualHeader] : row[originalHeader];

      if (
        args.body.splitNameColumn &&
        originalHeader === args.body.splitNameColumn &&
        mappedField === "name"
      ) {
        const fullName = value || "";

        if (fullName.includes(",")) {
          const [lastName, firstName] = fullName
            .split(",")
            .map((part) => part.trim());
          contact.firstname = firstName;
          contact.surname = lastName;
        } else {
          const nameParts = fullName.split(" ").filter(Boolean);
          if (nameParts.length > 1) {
            const lastName = nameParts.pop() || "";
            const firstName = nameParts.join(" ");
            contact.firstname = firstName;
            contact.surname = lastName;
          } else {
            contact.firstname = fullName;
            contact.surname = "";
          }
        }
      } else if (mappedField === "other_data") {
        contact.other_data.push({ [originalHeader]: value || "" });
      } else {
        contact[mappedField] = value || "";
      }
    }

    return contact;
  });
}

