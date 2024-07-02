import { useState } from "react";
import CampaignSettingsScriptQuestionBlock from "./CampaignSettings.Script.QuestionBlock";
import { FaPlus } from "react-icons/fa";

export default function CampaignSettingsScript({ pageData, onPageDataChange }) {
    const questions = pageData.campaignDetails?.questions || [];
    const [openQuestion, setOpenQuestion] = useState(null);

    const addQuestion = () => {
        const newQuestion = {
            id: `new-question-${questions.length + 1}`,
            title: "",
            type: "textarea",
            order: questions.length,
        };
        onPageDataChange({
            ...pageData,
            campaignDetails: {
                ...pageData.campaignDetails,
                questions: [...questions, newQuestion]
            },
            openQuestionId: newQuestion.id
        });
    };

    const removeQuestion = (id) => {
        onPageDataChange({
            ...pageData,
            campaignDetails: {
                ...pageData.campaignDetails,
                questions: questions.filter(q => q.id !== id)
            }
        });
    };

    const moveQuestion = (index, direction) => {
        if ((direction === -1 && index === 0) || (direction === 1 && index === questions.length - 1)) return;

        const newQuestions = [...questions];
        const temp = newQuestions[index];
        newQuestions[index] = newQuestions[index + direction];
        newQuestions[index + direction] = temp;

        newQuestions[index].order = index;
        newQuestions[index + direction].order = index + direction;

        onPageDataChange({
            ...pageData,
            campaignDetails: {
                ...pageData.campaignDetails,
                questions: newQuestions
            }
        });
    };

    const dispatchState = (oldState, newState) => {
        const updatedQuestions = questions.map(q => q.id === newState.id ? newState : q);
        onPageDataChange({
            ...pageData,
            campaignDetails: {
                ...pageData.campaignDetails,
                questions: updatedQuestions
            }
        });
    };

    return (
        <div>
            <div className="flex gap-2 px-2 my-1">
                <div className="flex flex-col" style={{
                    flex: '1 1 20%',
                    border: "3px solid #BCEBFF",
                    borderRadius: "20px",
                    minHeight: "300px"
                }}>
                    <button className="bg-primary text-white font-Zilla-Slab text-xl px-2 py-2 gap-2" onClick={addQuestion} style={{ justifyContent: 'center', display: "flex", alignItems: "center", borderTopLeftRadius: "18px", borderTopRightRadius: "18px" }}>
                        Add Question<FaPlus size="16px" />
                    </button>
                    {questions.map((question) => (
                        <button 
                            key={question.id} 
                            onClick={() => setOpenQuestion(question.id)} 
                            style={{ textAlign: 'left', border: "1px solid #f1f1f1" }} 
                            className={`px-2 hover:bg-accent ${pageData.openQuestionId === question.id && 'bg-brand-secondary'}`}
                        >
                            {question.title || question.id}
                        </button>
                    ))}
                </div>
                <div className="flex flex-col" style={{ flex: '1 1 60%' }}>
                    {questions.map((question, index) => (
                        <CampaignSettingsScriptQuestionBlock
                            key={question.id}
                            question={question}
                            removeQuestion={removeQuestion}
                            moveUp={() => moveQuestion(index, -1)}
                            moveDown={() => moveQuestion(index, 1)}
                            openQuestion={openQuestion}
                            setOpenQuestion={setOpenQuestion}
                            dispatchState={(newState) => dispatchState(question, newState)}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}