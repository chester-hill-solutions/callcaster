export interface AudienceUploadRequestBody {
  uploadId: number;
  audienceId: number;
  workspaceId: string;
  userId: string;
  fileContent: string; // base64 encoded CSV
  headerMapping: Record<string, string>;
  splitNameColumn: string | null;
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
  if (typeof atob === "function") {
    return atob(base64);
  }
  // Node fallback
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (typeof Buffer !== "undefined") {
    return Buffer.from(base64, "base64").toString("utf8");
  }
  throw new Error("No base64 decoder available");
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

  const headers = parseCsvLine(lines[0]);
  const records: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const values = parseCsvLine(lines[i]);
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

