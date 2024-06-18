import { useNavigation } from "@remix-run/react";
import Result from "./CallList/CallContact/Result";
import { Button } from "./ui/button";

const CallQuestionnaire = ({ handleResponse: intentAction, campaignDetails, update, nextRecipient: contact, handleQuickSave }) => {
    
    return (
        <div style={{ position: "relative", minWidth:"40%", flex:"1 1 auto", border: '3px solid #BCEBFF', borderRadius: "20px", marginBottom: "2rem", backgroundColor: 'hsl(var(--card))', boxShadow: "3px 5px 0  rgba(50,50,50,.6)" }} className="flex-col flex">
            <div style={{
                display: 'flex',
                alignItems: "center",
                justifyContent: 'space-between',
                borderTopLeftRadius: '18px',
                borderTopRightRadius: '18px',
                padding: "16px",
                marginBottom: "10px",
            }}
                className="bg-brand-primary text-white font-Tabac-Slab text-xl "
            >
                <div style={{ display: "flex", flex: "1", justifyContent: "center" }}>
                    Script & Questionnaire {contact && contact.contact && `- ${contact.contact?.firstname} ${contact.contact?.surname}`}
                </div>
            </div>
            <div>
                <div style={{ padding: "8px 16px", width: "100%" }}>

                    <div style={{ padding: "8px 16px", display: "flex", flexDirection: "column", gap: '16px' }}>
                        {campaignDetails?.questions.sort((a, b) => a.order - b.order).map((key, i) => {
                            return (
                                <Result disabled={!contact?.contact} action={intentAction} questions={key} key={`questions-${key.id}`} questionId={key.id} initResult={update[key.id]} type={key.type} />
                            )
                        })}
                    </div>
                    <div className="flex p-2 flex-auto justify-end">
                        <Button onClick={handleQuickSave}>
                            Save
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    )
}

export { CallQuestionnaire }
