export type CsvSource = {
  recordNumber: number;
  byteStart: number;
  byteEnd: number;
  startLine: number;
  endLine: number;
};

function newlineAt(bytes: Buffer, offset: number): Buffer {
  if (bytes[offset] === 13) {
    return bytes.subarray(offset, offset + (bytes[offset + 1] === 10 ? 2 : 1));
  }
  return bytes[offset] === 10 ? bytes.subarray(offset, offset + 1) : Buffer.alloc(0);
}

export function createCsvSourceTracker(content: string): (recordEnd: number) => CsvSource {
  const bytes = Buffer.from(content, "utf8");
  let cursor = bytes.subarray(0, 3).equals(Buffer.from([239, 187, 191])) ? 3 : 0;
  let line = 1;
  let lastLine = 1;
  let recordNumber = 0;
  let delimiter = newlineAt(bytes, cursor);

  // csv-parse counts quoted CRLF twice in its line counter. Scan the original
  // bytes so physical lines and UTF-8 positions agree with the saved CSV.
  const advanceTo = (offset: number) => {
    while (cursor < offset) {
      const byte = bytes[cursor];
      const followsCr = byte === 10 && bytes[cursor - 1] === 13;
      lastLine = followsCr ? line - 1 : line;
      if (byte === 13 || (byte === 10 && !followsCr)) line += 1;
      cursor += 1;
    }
  };

  return (recordEnd) => {
    if (!Number.isSafeInteger(recordEnd) || recordEnd <= cursor || recordEnd > bytes.length) {
      throw new Error("Invalid CSV source boundary");
    }
    // Autodetection occurs outside quoted fields. A leading blank line fixes
    // the delimiter; otherwise the first emitted boundary reveals it.
    if (recordNumber === 0 && delimiter.length === 0) {
      const ending = bytes[recordEnd - 1];
      const offset = ending === 10 && bytes[recordEnd - 2] === 13 ? recordEnd - 2 : recordEnd - 1;
      delimiter = newlineAt(bytes, offset);
    }
    const matchesAt = (offset: number) =>
      delimiter.length > 0 && bytes.subarray(offset, offset + delimiter.length).equals(delimiter);
    while (matchesAt(cursor)) advanceTo(cursor + delimiter.length);
    const byteStart = cursor;
    const startLine = line;
    const byteEnd = matchesAt(recordEnd - delimiter.length) ? recordEnd - delimiter.length : recordEnd;
    advanceTo(byteEnd);
    const endLine = lastLine;
    advanceTo(recordEnd);
    recordNumber += 1;
    return { recordNumber, byteStart, byteEnd, startLine, endLine };
  };
}
