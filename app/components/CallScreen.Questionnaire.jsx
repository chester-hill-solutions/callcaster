import Result from "../components/CallList/CallContact/Result";

const CallQuestionnaire = ({ handleResponse: intentAction, campaignDetails, update, nextRecipient: contact }) => {

    return (
        <div style={{ position: "relative", flex: "1 0 40%", border: '3px solid #BCEBFF', borderRadius: "20px", marginBottom: "2rem", background: "#f1f1f1", boxShadow: "3px 5px 0  rgba(50,50,50,.6)" }} className="flex-col flex">
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
                    Script & Questionnaire {contact && `- ${contact.contact.firstname} ${contact.contact.surname}`}
                </div>
            </div>
            <div>
                <div style={{ padding: "8px 16px", width: "100%" }}>
                    
                    <div style={{ padding: "8px 16px", display: "flex", flexDirection: "column", gap: '16px' }}>
                        {Object.keys(campaignDetails?.questions).sort((a, b) => campaignDetails.questions[a].order - campaignDetails.questions[b].order).map((key) => {
                            return (
                                <Result action={intentAction} questions={campaignDetails.questions[key]} key={`questions-${key}`} questionId={key} initResult={update[key]} type={campaignDetails.questions[key]?.type} />
                            )
                        })}
                    </div>
                </div>
            </div>
        </div>
    )
}

export { CallQuestionnaire }