import { useEffect, useState } from "react"
import CampaignSettingsScriptQuestionBlock from "./CampaignSettings.Script.QuestionBlock";
import { deepEqual } from "~/lib/utils";
export default function CampaignSettingsScript({ questions: initQuestions, setChanged }) {
    const [questions, setQuestions] = useState(initQuestions);

    const removeQuestion = (id) => {
        setQuestions((prevQuestions) => prevQuestions.filter((question) => question.id !== id));
    };
    const addQuestion = () => {
        setQuestions((prevQuestions) => ([...prevQuestions, {id:`new-question-${questions.length + 1}`, title: '', type:"textarea"}]))
    }
    useEffect(() => {
        setChanged(!deepEqual(questions, initQuestions))
    },[initQuestions, questions, setChanged])
    return (<div>
        <h3>Questions & Script</h3>
        <div className="flex flex-col gap-2">
            <button onClick={addQuestion}>Add Question</button>
            {questions.map((question) => (
                <CampaignSettingsScriptQuestionBlock {...{ question, removeQuestion }} />
            ))}
        </div>
    </div>)
}
