import { useEffect } from "react";

export const useCsvDownload = (csvData: { csvContent: string, filename: string }) => {
  useEffect(() => {
    if (csvData && csvData.csvContent) {
      const blob = new Blob([csvData.csvContent], { type: "text/csv" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = csvData.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    }
  }, [csvData]);
};
