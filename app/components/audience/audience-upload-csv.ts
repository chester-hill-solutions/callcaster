import { parse } from "csv-parse/sync";
import { logger } from "@/lib/logger.client";
import { CONTACT_IMPORT_TARGETS } from "../../../shared/contact-import-headers";

export const VALID_HEADERS = CONTACT_IMPORT_TARGETS.filter(
  (target) => target !== "name",
);

export const parseCSVHeaders = (unparsedHeaders: string[]) => {
  return unparsedHeaders.map((header) => header.toLowerCase().trim());
};

type CSVRecord = Record<string, string | number | null | undefined>;

export const parseCSVData = (records: CSVRecord[], headers: string[]) => {
  return records.map((record) => {
    const contact: Record<string, string> = {};
    headers.forEach((header) => {
      const recordKey = Object.keys(record).find(
        (key) => key.toLowerCase() === header.toLowerCase(),
      );
      contact[header] = recordKey ? String(record[recordKey] || "") : "";
    });
    return contact;
  });
};

/** Parse CSV with columns option for better mapping. */
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

    const headers = parseCSVHeaders(rawHeaderRow ?? []);
    const contacts = parseCSVData(records, headers);
    return { headers, contacts };
  } catch (error) {
    logger.error("Error parsing CSV:", error);
    throw new Error("Failed to parse CSV file");
  }
};
