import { CheckCircleIcon } from "lucide-react";
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
  const isSelected = house?.find(
    (queueItem) => queueItem?.contact?.id === questionContact?.contact?.id,
  );
  return (
    <div
      style={{
        border: "3px solid #BCEBFF",
        borderRadius: "20px",
        //backgroundColor: "hsl(var(--card))",
        minHeight: "300px",
        alignItems: "stretch",
        flexDirection: "column",
        display: "flex",
        boxShadow: "3px 5px 0  rgba(50,50,50,.6)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderTopLeftRadius: "18px",
          borderTopRightRadius: "18px",
          padding: "16px",
          background: "hsl(var(--brand-secondary))",
          width: "100%",
          textAlign: "center",
        }}
        className="font-Tabac-Slab text-xl dark:text-slate-800"
      >
        <div style={{ display: "flex", flex: "1", justifyContent: "center" }}>
          Household Members
        </div>
      </div>
      {house?.filter(Boolean).map((queueItem: QueueItemRow) => (
        // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
        <div
          key={queueItem.contact.id}
          className={`m-1 flex justify-center rounded-2xl p-2  ${isSelected?.contact?.id === queueItem.contact?.id ? "border-2 border-primary bg-gray-100" : "bg-secondary"} hover:shadow-inner-lg transition-all hover:bg-gray-100 hover:opacity-85`}
          onClick={() =>
            !isBusy && switchQuestionContact({ contact: queueItem })
          }
        >
          <div className="flex flex-auto items-center justify-between font-Zilla-Slab text-lg font-semibold dark:text-slate-800">
            <div>
              {queueItem.contact.firstname} {queueItem.contact.surname}
            </div>
            <div>
              {(() => {
                const attempt = attemptList.find(
                  (a: Attempt) =>
                    a.contact_id === queueItem.contact.id,
                );
                if (
                  attempt?.result &&
                  typeof attempt.result === "object" &&
                  !Array.isArray(attempt.result)
                ) {
                  const resultObject = attempt.result as Record<string, unknown>;
                  if ("status" in resultObject && resultObject["status"]) {
                    return <CheckCircleIcon size={"16px"} />;
                  }
                }
                return null;
              })()}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
