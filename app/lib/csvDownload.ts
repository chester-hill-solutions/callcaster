import { logger } from "@/lib/logger.client";

/**
 * Utility function to download CSV content as a file
 * @param csvContent - The CSV content string
 * @param filename - The filename for the downloaded file
 * @throws Error if csvContent is empty or invalid
 */
export function downloadCsv(csvContent: string, filename: string): void {
    if (!csvContent || typeof csvContent !== 'string') {
        throw new Error('CSV content must be a non-empty string');
    }

    if (!filename || typeof filename !== 'string') {
        throw new Error('Filename must be a non-empty string');
    }

    try {
        const blob = new Blob([csvContent], { type: "text/csv" });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
    } catch (error) {
        logger.error('Error downloading CSV:', error);
        throw new Error(`Failed to download CSV: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

