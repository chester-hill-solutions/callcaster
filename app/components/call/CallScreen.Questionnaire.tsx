import React, { useEffect, useState } from "react";
import { useNavigation } from "@remix-run/react";
import Result from "~/components/call-list/CallList/CallContact/Result";
import { Button } from "~/components/ui/button";
import { Tables } from "~/lib/database.types";
import { Block, BlockOption } from "~/lib/types";

type Contact = Tables<"contact">;
type QueueItem = Tables<"campaign_queue"> & { contact: Contact };
type CampaignDetails = Tables<"live_campaign">;

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
        options?: BlockOption[];
        audioFile: string;
      };
    };
  };
}

type BlockResponseValue = string | number | boolean | string[] | null | undefined;

interface CallQuestionnaireProps {
  handleResponse: (response: {
    pageId: string;
    blockId: string;
    value: BlockResponseValue;
  }) => void;
  campaignDetails: CampaignDetails & { script: Script };
  update: Record<string, Record<string, BlockResponseValue>>;
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
  const navigation = useNavigation();
  const [currentPageId, setCurrentPageId] = useState(
    Object.keys(campaignDetails.script?.steps?.pages || {})?.[0]
  );
  const [localUpdate, setLocalUpdate] = useState(update || {});

  useEffect(() => {
    setLocalUpdate(update || {});
      }, [update]);

  const handleBlockResponse = (blockId: string, value: BlockResponseValue) => {
    const newUpdate = {
      ...localUpdate,
      [currentPageId]: {
        ...(localUpdate[currentPageId] || {}),
        [blockId]: value,
      },
    };
    setLocalUpdate(newUpdate);
    handleResponse({ pageId: currentPageId, blockId, value });
  };

  const renderBlock = (blockId: string) => {
    const block = campaignDetails.script?.steps?.blocks?.[blockId];
    
    if (!block) {
      return null;
    }
    
    return (
      <div key={`questions-${blockId}`}>
      <Result
        disabled={disabled}
        action={(response) => handleBlockResponse(blockId, response.value)}
        questions={block as Block}
        key={`questions-${blockId}`}
        questionId={blockId}
        initResult={localUpdate[blockId] || null}
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
          {campaignDetails.script?.steps?.pages?.[currentPageId]?.blocks.map(
            renderBlock,
          )}
        </div>
        {campaignDetails.script?.steps?.pages && <div className="mt-4 flex justify-between">
          <Button
            onClick={() => {
              const pageIds = Object.keys(campaignDetails.script?.steps?.pages || {});
              const currentIndex = pageIds.indexOf(currentPageId);
              if (currentIndex > 0) {
                setCurrentPageId(pageIds[currentIndex - 1]);
              }
            }}
            disabled={
              isBusy ||
              currentPageId ===
              Object.keys(campaignDetails.script?.steps?.pages || {})?.[0]
            }
          >
            Previous Page
          </Button>
          <Button
            onClick={() => {
              const pageIds = Object.keys(campaignDetails.script?.steps?.pages || {});
              const currentIndex = pageIds.indexOf(currentPageId);
              if (currentIndex < pageIds.length - 1) {
                setCurrentPageId(pageIds[currentIndex + 1]);
              }
            }}
            disabled={
              isBusy ||
              currentPageId ===
              Object.keys(campaignDetails.script?.steps?.pages || {})[
                Object.keys(campaignDetails.script?.steps?.pages || {}).length - 1
              ]
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
