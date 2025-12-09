import { useState, useEffect } from "react";
import { Button } from "~/components/ui/button";
import { Loader2, Download } from "lucide-react";

interface AsyncExportButtonProps {
  campaignId: string;
  workspaceId: string;
}

export const AsyncExportButton = ({ campaignId, workspaceId }: AsyncExportButtonProps) => {
  const [isExporting, setIsExporting] = useState(false);
  const [exportId, setExportId] = useState<string | null>(null);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<{ title: string; description: string; type: "success" | "error" | "info" } | null>(null);

  // Poll for export status if an export is in progress
  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    if (exportId && (exportStatus === "processing" || exportStatus === "started")) {
      intervalId = setInterval(async () => {
        try {
          const response = await fetch(`/api/campaign-export-status?exportId=${exportId}&workspaceId=${workspaceId}`);
          const data = await response.json();
          
          setExportStatus(data.status);
          if (data.progress) setProgress(data.progress);
          
          if (data.status === "completed") {
            setIsExporting(false);
            setDownloadUrl(data.downloadUrl);
            setToastMessage({
              title: "Export completed",
              description: "Your campaign data export is ready for download.",
              type: "success"
            });
            clearInterval(intervalId);
          } else if (data.status === "error") {
            setIsExporting(false);
            setToastMessage({
              title: "Export failed",
              description: data.error || "An error occurred during export.",
              type: "error"
            });
            clearInterval(intervalId);
          }
        } catch (error) {
          console.error("Error checking export status:", error);
        }
      }, 2000); // Check every 2 seconds
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [exportId, exportStatus]);

  // Display toast message when it changes
  useEffect(() => {
    if (toastMessage) {
      // In a real implementation, you would use your toast system here
      console.log(`Toast: ${toastMessage.title} - ${toastMessage.description}`);
      
      // Clear the toast message after displaying it
      const timeoutId = setTimeout(() => {
        setToastMessage(null);
      }, 3000);
      
      return () => clearTimeout(timeoutId);
    }
  }, [toastMessage]);

  const startExport = async () => {
    setIsExporting(true);
    setDownloadUrl(null);
    
    try {
      const formData = new FormData();
      formData.append("campaignId", campaignId);
      formData.append("workspaceId", workspaceId);
      
      const response = await fetch("/api/campaign-export", {
        method: "POST",
        body: formData,
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setExportId(data.exportId);
        setExportStatus(data.status);
        setToastMessage({
          title: "Export started",
          description: "Your campaign data export has started. This may take a few minutes for large campaigns.",
          type: "info"
        });
      } else {
        setIsExporting(false);
        setToastMessage({
          title: "Export failed",
          description: data.error || "Failed to start export.",
          type: "error"
        });
      }
    } catch (error) {
      setIsExporting(false);
      setToastMessage({
        title: "Export failed",
        description: "An error occurred while starting the export.",
        type: "error"
      });
      console.error("Export error:", error);
    }
  };

  return (
    <div className="flex items-center gap-2">
      {!downloadUrl ? (
        <Button 
          onClick={startExport} 
          disabled={isExporting}
          variant="outline"
        >
          {isExporting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Exporting...
            </>
          ) : (
            "Export Results"
          )}
        </Button>
      ) : (
        <a 
          href={downloadUrl} 
          download 
          className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2"
        >
          <Download className="mr-2 h-4 w-4" />
          Download Export
        </a>
      )}
      
      {isExporting && progress > 0 && (
        <div className="text-sm text-gray-500">
          {progress}% complete
        </div>
      )}
      
      {toastMessage && (
        <div className={`fixed bottom-4 right-4 p-4 rounded-md shadow-lg ${
          toastMessage.type === 'error' ? 'bg-red-100 text-red-800' : 
          toastMessage.type === 'success' ? 'bg-green-100 text-green-800' : 
          'bg-blue-100 text-blue-800'
        }`}>
          <h4 className="font-bold">{toastMessage.title}</h4>
          <p>{toastMessage.description}</p>
        </div>
      )}
    </div>
  );
}; 