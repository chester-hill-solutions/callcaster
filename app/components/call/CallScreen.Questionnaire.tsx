import { useEffect, useState } from "react";
import Result from "@/components/campaign/settings/script/Result";
import { Button } from "@/components/ui/button";
import {
  callPanelHeaderPrimaryClass,
  callPanelShellClass,
} from "@/components/call/call-panel-classes";
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
  isBusy,
}: CallQuestionnaireProps) => {
  const scriptSteps = campaignDetails.script?.steps as Script["steps"] | undefined;
  const pageKeys = Object.keys(scriptSteps?.pages || {});
  const [currentPageId, setCurrentPageId] = useState<string | undefined>(
    pageKeys[0] || undefined,
  );
  const [localUpdate, setLocalUpdate] = useState(update || {});

  useEffect(() => {
    setLocalUpdate(update || {});
  }, [update]);

  const handleBlockResponse = (
    blockId: string,
    value: string | boolean | string[],
  ) => {
    const pageId = currentPageId!;
    const newUpdate = {
      ...localUpdate,
      [pageId]: {
        ...((localUpdate[pageId] as Record<string, unknown>) || {}),
        [blockId]: value,
      },
    };
    setLocalUpdate(newUpdate);
    handleResponse({ pageId, blockId, value });
  };

  const renderBlock = (blockId: string) => {
    const block = scriptSteps?.blocks?.[blockId];

    if (!block) return null;

    const pageId = currentPageId!;
    const pageUpdate = localUpdate[pageId] as Record<string, unknown> | undefined;
    const blockValue = pageUpdate?.[blockId];

    return (
      <div key={`questions-${blockId}`}>
        <Result
          disabled={disabled}
          action={(response) => handleBlockResponse(blockId, response.value)}
          questions={block}
          key={`questions-${blockId}`}
          questionId={blockId}
          initResult={
            (blockValue as string | boolean | string[] | null | undefined) || null
          }
        />
      </div>
    );
  };

  const contactLabel =
    contact?.contact != null
      ? ` - ${contact.contact.firstname} ${contact.contact.surname}`
      : "";

  return (
    <div className={`${callPanelShellClass} min-w-0 flex-1`}>
      <div className={callPanelHeaderPrimaryClass}>
        Script & Questionnaire{contactLabel}
      </div>
      <div className="flex flex-col p-4">
        <div className="flex flex-col gap-4">
          {(scriptSteps?.pages?.[currentPageId || ""]?.blocks ?? []).map(renderBlock)}
        </div>
        {scriptSteps?.pages && currentPageId ? (
          <div className="mt-4 flex justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                const pageIds = Object.keys(scriptSteps.pages!);
                const currentIndex = pageIds.indexOf(currentPageId);
                setCurrentPageId(pageIds[currentIndex - 1]);
              }}
              disabled={isBusy || currentPageId === pageKeys[0]}
            >
              Previous Page
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                const pageIds = Object.keys(scriptSteps.pages!);
                const currentIndex = pageIds.indexOf(currentPageId);
                setCurrentPageId(pageIds[currentIndex + 1]);
              }}
              disabled={
                isBusy || currentPageId === pageKeys[pageKeys.length - 1]
              }
            >
              Next Page
            </Button>
          </div>
        ) : null}
        <div className="flex justify-end p-2">
          <Button type="button" onClick={handleQuickSave} disabled={isBusy}>
            Save
          </Button>
        </div>
      </div>
    </div>
  );
};

export { CallQuestionnaire };
