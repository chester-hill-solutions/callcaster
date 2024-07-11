import { useNavigation } from "@remix-run/react";
import Result from "./CallList/CallContact/Result";
import { Button } from "./ui/button";
import { Tables } from "~/lib/database.types";

type Contact = Tables<"contact">;
type QueueItem = Tables<"campaign_queue"> & { contact: Contact };
type CampaignDetails = Tables<"live_campaign">;
interface CallQuestionnaireProps {
  handleResponse: (response: { column: string; value: any }) => void;
  campaignDetails: CampaignDetails;
  update: Record<string, any>;
  nextRecipient: QueueItem | null;
  handleQuickSave: () => void;
  disabled: boolean;
}

const CallQuestionnaire = ({
  handleResponse: intentAction,
  campaignDetails,
  update,
  nextRecipient: contact,
  handleQuickSave,
  disabled
}: CallQuestionnaireProps) => {
  const navigation = useNavigation();
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
            `- ${contact.contact?.firstname} ${contact.contact?.surname}`}
        </div>
      </div>
      <div>
        <div style={{ padding: "8px 16px", width: "100%" }}>
          <div
            style={{
              padding: "8px 16px",
              display: "flex",
              flexDirection: "column",
              gap: "16px",
            }}
          >
            {Object.values(campaignDetails?.questions?.blocks || {}).map(
              (key) => (
                <Result
                  disabled={disabled}
                  action={intentAction}
                  questions={key}
                  key={`questions-${key.id}`}
                  questionId={key.id}
                  initResult={update ? update[key.id] : null}
                  type={key.type}
                />
              ),
            )}
          </div>
          <div className="flex flex-auto justify-end p-2">
            <Button
              onClick={handleQuickSave}
              disabled={navigation.state !== "idle"}
            >
              Save
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export { CallQuestionnaire };
