import { useEffect, useState } from "react";
import Result from "@/components/call-list/records/participant/Result";
import { Button } from "@/components/ui/button";
import { Tables } from "@/lib/database.types";
import { CampaignDetails, Block } from "@/lib/types";

type Contact = Tables<"contact">;
type QueueItem = Tables<"campaign_queue"> & { contact: Contact };

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
      [key: string]: Block;
    };
  };
}


interface CallQuestionnaireProps {
  handleResponse: (response: {
    pageId: string;
    blockId: string;
    value: string | boolean | string[];
  }) => void;
  campaignDetails: CampaignDetails;
  update: Record<string, unknown>;
  nextRecipient: QueueItem | null;
  handleQuickSave: () => void;
  disabled: boolean;
  isBusy: boolean;
}
const CallQuestionnaire = ({
  handleResponse,
  campaignDetails,
  update,
  nextRecipient: contact,
  handleQuickSave,
  disabled,
  isBusy
}: CallQuestionnaireProps) => {
  const scriptSteps = campaignDetails.script?.steps as Script['steps'] | undefined;
  const pageKeys = Object.keys(scriptSteps?.pages || {});
  const [currentPageId, setCurrentPageId] = useState<string | undefined>(
    pageKeys[0] || undefined
  );
  const [localUpdate, setLocalUpdate] = useState(update || {});

  useEffect(() => {
    setLocalUpdate(update || {});
      }, [update]);

  const handleBlockResponse = (blockId: string, value: string | boolean | string[]) => {
    if (!currentPageId) return;
    
    const newUpdate = {
      ...localUpdate,
      [currentPageId]: {
        ...(localUpdate[currentPageId] as Record<string, unknown> || {}),
        [blockId]: value,
      },
    };
    setLocalUpdate(newUpdate);
    handleResponse({ pageId: currentPageId, blockId, value });
  };

  const renderBlock = (blockId: string) => {
    const block = scriptSteps?.blocks?.[blockId];
    
    if (!block) return null;
    
    const pageUpdate = currentPageId ? (localUpdate[currentPageId] as Record<string, unknown> | undefined) : undefined;
    const blockValue = pageUpdate?.[blockId];
    
    return (
      <div key={`questions-${blockId}`}>
      <Result
        disabled={disabled}
        action={(response) => handleBlockResponse(blockId, response.value)}
        questions={block}
        key={`questions-${blockId}`}
        questionId={blockId}
        initResult={(blockValue as string | boolean | string[] | null | undefined) || null}
      />
      </div>
    );
  };

  return (

    <div
      style={{
        position: "relative",
        minWidth: "30%",
        flex: "1 1 auto",
        border: "3px solid #BCEBFF",
        borderRadius: "20px",
        backgroundColor: "hsl(var(--card))",
        boxShadow: "3px 5px 0  rgba(50,50,50,.6)",
      }}
      className="flex flex-col"
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderTopLeftRadius: "18px",
          borderTopRightRadius: "18px",
          padding: "16px",
          marginBottom: "10px",
        }}
        className="bg-brand-primary font-Tabac-Slab text-xl text-white "
      >
        <div style={{ display: "flex", flex: "1", justifyContent: "center" }}>
          Script & Questionnaire{" "}
          {contact &&
            contact.contact &&
            ` - ${contact.contact.firstname} ${contact.contact.surname}`}
        </div>
      </div>
      <div className="p-4">
        <div className="flex flex-col gap-4">
          {currentPageId && scriptSteps?.pages?.[currentPageId]?.blocks.map(
            renderBlock,
          )}
        </div>
        {scriptSteps?.pages && currentPageId && <div className="mt-4 flex justify-between">
          <Button
            onClick={() => {
              const pageIds = Object.keys(scriptSteps?.pages || {});
              const currentIndex = pageIds.indexOf(currentPageId);
              if (currentIndex > 0) {
                setCurrentPageId(pageIds[currentIndex - 1]);
              }
            }}
            disabled={
              isBusy ||
              !currentPageId ||
              currentPageId === pageKeys[0]
            }
          >
            Previous Page
          </Button>
          <Button
            onClick={() => {
              const pageIds = Object.keys(scriptSteps?.pages || {});
              const currentIndex = pageIds.indexOf(currentPageId);
              if (currentIndex < pageIds.length - 1) {
                setCurrentPageId(pageIds[currentIndex + 1]);
              }
            }}
            disabled={
              isBusy ||
              !currentPageId ||
              currentPageId === pageKeys[pageKeys.length - 1]
            }
          >
            Next Page
          </Button>
        </div>}
        <div className="flex justify-end p-2">
          <Button
            onClick={handleQuickSave}
            disabled={isBusy}
          >
            Save
          </Button>
        </div>
      </div>
    </div>
  );
};

export { CallQuestionnaire };
