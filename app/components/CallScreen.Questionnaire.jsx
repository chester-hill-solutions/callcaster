import Result from "../components/CallList/CallContact/Result";


const CallQuestionnaire = ({ handleResponse: intentAction, campaignDetails, update, }) => (
    <div style={{ flex: "1 0 40%", border: '3px solid #BCEBFF', borderRadius: "20px", marginBottom: "2rem" }} className="flex-col flex">
        <tr>
            <td colSpan={6} style={{ padding: "8px 16px", }}>
                <div style={{ padding: "8px 16px", display: "flex", flexDirection: "column", gap: '16px' }}>
                    {Object.keys(campaignDetails?.questions).sort((a, b) => campaignDetails.questions[a].order - campaignDetails.questions[b].order).map((key) => (
                        <Result action={intentAction} questions={campaignDetails.questions[key]} key={`questions-${key}`} questionId={key} initResult={update[key]} type={campaignDetails.questions[key].type} />
                    ))}
                </div>
            </td>
        </tr>
    </div>
)

export { CallQuestionnaire }