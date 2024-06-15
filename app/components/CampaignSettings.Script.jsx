import { useEffect, useState } from "react";
import CampaignSettingsScriptQuestionBlock from "./CampaignSettings.Script.QuestionBlock";
import { deepEqual } from "~/lib/utils";

export default function CampaignSettingsScript({ questions: initQuestions, setChanged }) {
    const [questions, setQuestions] = useState(() => {
        return initQuestions.map((q, index) => ({ ...q, order: index }));
    });

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

    useEffect(() => {
        setChanged((prev) => !deepEqual(questions, initQuestions));
        
    }, [initQuestions, questions, setChanged]);

    return (
        <div>
            <h3>Questions & Script</h3>
            <div className="flex flex-col gap-2">
                <button onClick={addQuestion}>Add Question</button>
                {questions.map((question, index) => (
                    <CampaignSettingsScriptQuestionBlock {...{ question, removeQuestion, setChanged, index, moveDown, moveUp, dispatchState:updateQuestion }} key={question.id} />
                ))}
            </div>
        </div>
    );
}
