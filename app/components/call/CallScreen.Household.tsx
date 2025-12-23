import { CheckCircleIcon } from "lucide-react";
<<<<<<< HEAD:app/components/call/CallScreen.Household.tsx
import { Tables } from "@/lib/database.types";

type Contact = Tables<"contact">;
type QueueItem = Tables<"campaign_queue"> & { contact: Contact };
type Attempt = Tables<"outreach_attempt"> & {
  result?: { status?: string };
};

interface HouseholdProps {
  house: QueueItem[];
  switchQuestionContact: (args: { contact: QueueItem }) => void;
  attemptList: Attempt[];
=======
import { Contact, OutreachAttempt, QueueItem } from "~/lib/types";

interface HouseholdProps {
  house: QueueItem[];
  switchQuestionContact: (params: { contact: QueueItem }) => void;
  attemptList: OutreachAttempt[];
>>>>>>> 43dba5c (Add new components and update TypeScript files for improved functionality):app/components/CallScreen.Household.tsx
  questionContact: QueueItem | null;
  isBusy: boolean;
}

<<<<<<< HEAD:app/components/call/CallScreen.Household.tsx
export const Household = ({ house, switchQuestionContact, attemptList, questionContact, isBusy }: HouseholdProps) => {
  const isSelected = house?.find((contact) => contact?.id === questionContact?.id)
=======
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
>>>>>>> 43dba5c (Add new components and update TypeScript files for improved functionality):app/components/CallScreen.Household.tsx
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
      {house?.filter(Boolean).map((queueItem: QueueItem) => (
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
                  (attempt: OutreachAttempt) =>
                    attempt.contact_id === queueItem.contact.id,
                );
                if (
                  attempt?.result &&
                  typeof attempt.result === "object" &&
                  !Array.isArray(attempt.result)
                ) {
                  const resultObject = attempt.result as Record<string, unknown>;
                  if ("status" in resultObject && resultObject.status) {
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
