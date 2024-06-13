import { useState } from "react"
import CampaignSettingsScriptQuestionBlock from "./CampaignSettings.Script.QuestionBlock";
export default function CampaignSettingsScript({ questions: initQuestions }) {
    const [questions, setQuestions] = useState(initQuestions);
    const onChange = () => null
    return (<div>
        <h3>Questions & Script</h3>
        <div className="flex flex-col gap-2">
            {questions.map((question) => (
                <CampaignSettingsScriptQuestionBlock {...{ question, onChange }} />
            ))}
        </div>
    </div>)
}
