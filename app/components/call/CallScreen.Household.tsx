import { CheckCircleIcon } from "lucide-react";
import {
  callPanelHeaderSecondaryClass,
  callPanelShellClass,
} from "@/components/call/call-panel-classes";
import { cn } from "@/lib/utils";
import { Tables } from "@/lib/database.types";

type ContactRow = Tables<"contact">;
type QueueItemRow = Tables<"campaign_queue"> & { contact: ContactRow };
type Attempt = Tables<"outreach_attempt"> & {
  result?: { status?: string };
};

interface HouseholdProps {
  house: QueueItemRow[];
  switchQuestionContact: (args: { contact: QueueItemRow }) => void;
  attemptList: Attempt[];
  questionContact: QueueItemRow | null;
  isBusy: boolean;
}

export const Household = ({
  house,
  switchQuestionContact,
  attemptList,
  questionContact,
  isBusy,
}: HouseholdProps) => {
  const selectedId = house?.find(
    (queueItem) => queueItem?.contact?.id === questionContact?.contact?.id,
  )?.contact?.id;

  return (
    <div className={callPanelShellClass}>
      <div className={callPanelHeaderSecondaryClass}>Household Members</div>
      {house?.filter(Boolean).map((queueItem: QueueItemRow) => {
        const isActive = selectedId === queueItem.contact.id;
        return (
          <button
            key={queueItem.contact.id}
            type="button"
            disabled={isBusy}
            className={cn(
              "m-1 flex w-[calc(100%-0.5rem)] justify-center rounded-lg p-3 text-left transition-colors duration-150",
              isActive
                ? "border-2 border-primary bg-primary/10"
                : "bg-secondary hover:bg-muted/70",
            )}
            onClick={() => switchQuestionContact({ contact: queueItem })}
          >
            <div className="flex w-full items-center justify-between font-Zilla-Slab text-lg font-semibold text-foreground">
              <div>
                {queueItem.contact.firstname} {queueItem.contact.surname}
              </div>
              <div>
                {(() => {
                  const attempt = attemptList.find(
                    (a: Attempt) => a.contact_id === queueItem.contact.id,
                  );
                  if (
                    attempt?.result &&
                    typeof attempt.result === "object" &&
                    !Array.isArray(attempt.result)
                  ) {
                    const resultObject = attempt.result as Record<string, unknown>;
                    if ("status" in resultObject && resultObject["status"]) {
                      return <CheckCircleIcon className="h-4 w-4 text-primary" />;
                    }
                  }
                  return null;
                })()}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
};
