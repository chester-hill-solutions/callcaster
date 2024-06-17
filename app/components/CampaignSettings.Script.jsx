import CampaignSettingsScriptQuestionBlock from "./CampaignSettings.Script.QuestionBlock";
import { FaPlus } from "react-icons/fa";

export default function CampaignSettingsScript({ questions, addQuestion, removeQuestion, moveUp, moveDown, openQuestion, setOpenQuestion, dispatchState }) {
    return (
        <div>
            <div className="flex gap-2 px-2 my-1">
                <div className="flex flex-col" style={{
                    flex: '1 1 20%',
                    border: "3px solid #BCEBFF",
                    borderRadius: "20px",
                    boxShadow: "3px 5px 0  rgba(50,50,50,.6)"
                }}>
                    <button className="bg-primary text-white font-Zilla-Slab text-xl px-2 py-2 gap-2" onClick={addQuestion} style={{ justifyContent: 'center', display: "flex", alignItems: "center", borderTopLeftRadius: "18px", borderTopRightRadius: "18px" }}>Add Question<FaPlus size="16px" />
                    </button>
                    {questions.map((question) => {
                        return (
                            <button key={question.id} onClick={() => setOpenQuestion((curr) => curr === question.id ? null : question.id)} style={{ textAlign: 'left', border:"1px solid #f1f1f1" }} className={`px-2 hover:bg-accent ${openQuestion === question.id && 'bg-brand-secondary'}`}>
                                {question.title || question.id}
                            </button>)
                    })}
                </div>
                <div className="flex flex-col" style={{ flex: '1 1 60%' }}>
                    {questions.map((question, index) => (
                        <CampaignSettingsScriptQuestionBlock {...{ question, removeQuestion, setChanged: () => null, index, moveDown, moveUp, openQuestion, setOpenQuestion, dispatchState }} key={question.id} />
                    ))}
                </div>
            </div>
        </div>
    );
}
