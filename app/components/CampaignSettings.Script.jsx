import { useEffect, useState } from "react";
import CampaignSettingsScriptQuestionBlock from "./CampaignSettings.Script.QuestionBlock";
import { deepEqual } from "~/lib/utils";

export default function CampaignSettingsScript({ questions: initQuestions = [] }) {
    const [questions, setQuestions] = useState(() => {
        return initQuestions.map((q, index) => ({ ...q, order: index }));
    });
    const [openQuestion, setOpenQuestion] = useState(questions[0].id)
    const removeQuestion = (id) => {
        setQuestions((prevQuestions) => prevQuestions.filter((question) => question.id !== id));
    };

    const addQuestion = () => {
        setQuestions((prevQuestions) => [
            ...prevQuestions,
            { id: `new-question-${questions.length + 1}`, title: '', type: "textarea", order: prevQuestions.length }
        ]);
    };

    const moveUp = (index) => {
        if (index <= 0) return;

        setQuestions((prevQuestions) => {

            const newQuestions = [...prevQuestions];
            [newQuestions[index], newQuestions[index - 1]] = [newQuestions[index - 1], newQuestions[index]];
            newQuestions[index].order = index;
            newQuestions[index - 1].order = index - 1;
            return newQuestions;
        });
    };

    const moveDown = (index) => {
        if (index >= questions.length - 1) return;

        setQuestions((prevQuestions) => {
            const newQuestions = [...prevQuestions];
            [newQuestions[index], newQuestions[index + 1]] = [newQuestions[index + 1], newQuestions[index]];
            newQuestions[index].order = index;
            newQuestions[index + 1].order = index + 1;
            return newQuestions;
        });
    };
    const updateQuestion = (index, updatedQuestion) => {
        setQuestions((prevQuestions) => {
            const newQuestions = [...prevQuestions];
            newQuestions[index] = { ...newQuestions[index], ...updatedQuestion };
            return newQuestions;
        });
    };

    /*     useEffect(() => {
            setChanged((prev) => !deepEqual(questions, initQuestions));
            
        }, [initQuestions, questions, setChanged]); */

    return (
        <div>
            <h3>Questions & Script</h3>
            <div className="flex gap-2">
                <div className="flex flex-col" style={{ flex: '1 1 10%' }}>
                    <button className="bg-primary text-white font-Zilla-Slab text-xl" onClick={addQuestion}>Add Question</button>
                    {questions.map((question) => {
                        return (<button onClick={() => setOpenQuestion(question.id)}>
                            {question.title}
                        </button>)
                    })}
                </div>
                <div className="flex flex-col" style={{ flex: '1 1 80%' }}>
                    {questions.map((question, index) => (
                        <CampaignSettingsScriptQuestionBlock {...{ question, removeQuestion, setChanged: () => null, index, moveDown, moveUp, dispatchState: updateQuestion, openQuestion }} key={question.id} />
                    ))}
                </div>
            </div>
        </div>
    );
}
