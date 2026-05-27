import { logger } from "@/lib/logger.client";

export function downloadBlobPart({
  data,
  filename,
  mimeType,
}: {
  data: BlobPart;
  filename: string;
  mimeType: string;
}): void {
  if (!filename) {
    throw new Error("Filename must be a non-empty string");
  }

  try {
    const blob = new Blob([data], { type: mimeType });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.parentNode?.removeChild(link);
    window.URL.revokeObjectURL(url);
  } catch (error) {
    logger.error("Error downloading file:", error);
    throw new Error(
      `Failed to download file: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

export function downloadCsv(csvContent: string, filename: string): void {
  if (!csvContent || typeof csvContent !== "string") {
    throw new Error("CSV content must be a non-empty string");
  }
  downloadBlobPart({
    data: csvContent,
    filename,
    mimeType: "text/csv;charset=utf-8",
  });
}
