import { Button } from "~/components/ui/button";
import { useNavigation } from "@remix-run/react";
import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, Save } from "lucide-react";
import Result from "./CallList/CallContact/Result";
import { Progress } from "~/components/ui/progress";
import { Tables } from "~/lib/database.types";

type Contact = Tables<"contact">;
type QueueItem = Tables<"campaign_queue"> & { contact: Contact };
type CampaignDetails = {
  campaign_id: number | null;
  created_at: string;
  disposition_options: any[];
  id: number;
  questions: any[];
  script_id: number | null;
  voicedrop_audio: string | null;
  workspace: string;
  script?: {
    steps?: {
      pages?: Record<string, any>;
      blocks?: Record<string, any>;
    };
  };
};

interface Script {
  steps?: {
    pages?: {
      [key: string]: {
        id: string;
        title: string;
        blocks: string[];
      };
    };
    blocks?: {
      [key: string]: {
        id: string;
        type: string;
        title: string;
        content: string;
        options: any[];
        audioFile: string;
      };
    };
  };
}

interface CallQuestionnaireProps {
  handleResponse: (response: { pageId: string; blockId: string; value: any }) => void;
  campaignDetails: {
    campaign_id: number | null;
    created_at: string;
    disposition_options: any[];
    id: number;
    questions: any[];
    script_id: number | null;
    voicedrop_audio: string | null;
    workspace: string;
    script?: {
      steps?: {
        pages?: Record<string, any>;
        blocks?: Record<string, any>;
      };
    };
  };
  update: Record<string, any>;
  nextRecipient: any;
  handleQuickSave: () => void;
  disabled: boolean;
  isBusy: boolean;
}

const CallQuestionnaire: React.FC<CallQuestionnaireProps> = ({
  handleResponse,
  campaignDetails,
  update,
  nextRecipient: contact,
  handleQuickSave,
  disabled,
  isBusy
}) => {
  const { state } = useNavigation();
  const [currentPage, setCurrentPage] = useState<string>("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");

  const pages = campaignDetails.script?.steps?.pages ? Object.keys(campaignDetails.script.steps.pages) : [];
  const currentPageIndex = pages.indexOf(currentPage);
  const progress = ((currentPageIndex + 1) / pages.length) * 100;

  const handleBlockResponse = (blockId: string, value: any) => {
    handleResponse({
      pageId: currentPage,
      blockId,
      value,
    });
  };

  const handleSave = async () => {
    setSaveStatus("saving");
    await handleQuickSave();
    setSaveStatus("saved");
    setTimeout(() => setSaveStatus("idle"), 2000);
  };

  const navigateToPage = (direction: "next" | "prev") => {
    const newIndex = direction === "next" ? currentPageIndex + 1 : currentPageIndex - 1;
    if (newIndex >= 0 && newIndex < pages.length) {
      setCurrentPage(pages[newIndex]);
    }
  };

  const renderBlock = (blockId: string) => {
    if (!campaignDetails.script?.steps?.blocks) return null;
    const block = campaignDetails.script.steps.blocks[blockId];
    if (!block) return null;

    return (
      <Result
        disabled={disabled}
        action={({ column, value }: { column: string; value: any }) => handleBlockResponse(column, value)}
        questions={block}
        key={blockId}
        questionId={blockId}
        initResult={update[blockId]}
      />
    );
  };

  useEffect(() => {
    if (pages.length > 0 && !currentPage) {
      setCurrentPage(pages[0]);
    }
  }, [pages, currentPage]);

  if (!campaignDetails.script?.steps?.pages) {
    return (
      <div 
        style={{
          border: "3px solid #BCEBFF",
          borderRadius: "20px",
          minHeight: "300px",
          boxShadow: "3px 5px 0 rgba(50,50,50,.6)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center"
        }}
      >
        <p className="text-gray-500 text-lg font-Zilla-Slab">No script available</p>
      </div>
    );
  }

  const currentBlocks = campaignDetails.script.steps.pages[currentPage]?.blocks || [];

  return (
    <div 
      style={{
        border: "3px solid #BCEBFF",
        borderRadius: "20px",
        minHeight: "300px",
        boxShadow: "3px 5px 0 rgba(50,50,50,.6)",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        backgroundColor: "hsl(var(--card))"
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderTopLeftRadius: "18px",
          borderTopRightRadius: "18px",
          padding: "16px",
          background: "hsl(var(--brand-secondary))",
        }}
        className="font-Tabac-Slab text-xl text-slate-800"
      >
        <div style={{ display: "flex", flex: "1", justifyContent: "center" }}>
          Script Questions
          <span className="ml-2 text-sm text-gray-600">
            Page {currentPageIndex + 1} of {pages.length}
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="px-4 py-2 border-b border-gray-200">
        <Progress value={progress} className="h-2" />
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="space-y-6 p-6">
          {currentBlocks.map((blockId: string) => renderBlock(blockId))}
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            <button
              onClick={() => navigateToPage("prev")}
              disabled={currentPageIndex === 0 || disabled || isBusy}
              style={{
                flex: "1 1 auto",
                padding: "4px 8px",
                border: "1px solid #d60000",
                borderRadius: "5px",
                fontSize: "small",
                opacity: currentPageIndex === 0 || disabled || isBusy ? ".6" : "unset",
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                minWidth: "80px",
                justifyContent: "center"
              }}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </button>
            <button
              onClick={() => navigateToPage("next")}
              disabled={currentPageIndex === pages.length - 1 || disabled || isBusy}
              style={{
                flex: "1 1 auto",
                padding: "4px 8px",
                border: "1px solid #d60000",
                borderRadius: "5px",
                fontSize: "small",
                opacity: currentPageIndex === pages.length - 1 || disabled || isBusy ? ".6" : "unset",
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                minWidth: "80px",
                justifyContent: "center"
              }}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <button
            onClick={handleSave}
            disabled={disabled || isBusy || state !== "idle"}
            style={{
              flex: "1 1 auto",
              padding: "4px 8px",
              background: "#4CA83D",
              borderRadius: "5px",
              color: "white",
              fontSize: "small",
              opacity: disabled || isBusy || state !== "idle" ? ".6" : "unset",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "4px",
              minWidth: "100px"
            }}
          >
            <Save className="h-4 w-4" />
            <span>
              {saveStatus === "saving" ? "Saving..." : 
               saveStatus === "saved" ? "Saved!" : "Save"}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default CallQuestionnaire;
