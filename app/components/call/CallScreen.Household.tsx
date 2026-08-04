import { CheckCircleIcon } from "lucide-react";
import { callPanelShellClass } from "@/components/call/call-panel-classes";
import { cn } from "@/lib/utils";
import type { Tables } from "@/lib/db-types";

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
    <section
      className={cn(callPanelShellClass, "p-3")}
      aria-labelledby="household-members-label"
    >
      <div
        id="household-members-label"
        className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
      >
        Household Members
      </div>
      <div className="flex flex-wrap gap-2">
        {house?.filter(Boolean).map((queueItem: QueueItemRow) => {
          const isActive = selectedId === queueItem.contact.id;
          return (
            <button
              key={queueItem.contact.id}
              type="button"
              disabled={isBusy}
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-3 py-2 text-left font-Zilla-Slab text-sm font-semibold transition-colors",
                isActive
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-secondary hover:bg-muted/70",
              )}
              onClick={() => switchQuestionContact({ contact: queueItem })}
            >
              <span>
                {queueItem.contact.firstname} {queueItem.contact.surname}
              </span>
              <span>
                {(() => {
                  const attempt = attemptList.find(
                    (a: Attempt) => a.contact_id === queueItem.contact.id,
                  );
                  if (
                    attempt?.result &&
                    typeof attempt.result === "object" &&
                    !Array.isArray(attempt.result)
                  ) {
                    const resultObject = attempt.result as Record<
                      string,
                      unknown
                    >;
                    if ("status" in resultObject && resultObject["status"]) {
                      return (
                        <CheckCircleIcon className="h-4 w-4 text-primary" />
                      );
                    }
                  }
                  return null;
                })()}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
};
