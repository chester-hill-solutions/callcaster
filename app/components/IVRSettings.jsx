import { useNavigate } from "@remix-run/react";
import { QuestionCard } from "./QuestionCard";
import { useState } from "react";
import { MdOutlineAddCircleOutline } from "react-icons/md";

export const IVRSettings = ({ pageData, edit = false, mediaNames = [], onChange }) => {
    const navigate = useNavigate();
    const [data, setData] = useState(pageData[0]);

    const handleQuestionChange = (questionIndex, updatedQuestion) => {
        const newStepData = [...data.step_data];
        newStepData[questionIndex] = updatedQuestion;
        const newData = { ...data, step_data: newStepData };
        setData(newData);
        onChange(newData);
    };

    const addNewQuestion = () => {
        const newQuestion = {
            step: `${data.step_data.length + 1}`,
            name: `New Question ${data.step_data.length + 1}`,
            speechType: "synthetic",
            say: "Enter your question here",
            responseType: "dtmf",
            nextStep: {}
        };

        const newStepData = [...data.step_data, newQuestion];
        const newData = { ...data, step_data: newStepData };
        setData(newData);
        onChange(newData);
    };

    return (
        <div>
            <div className="my-1 flex gap-2 px-2">
                <div className="flex gap-8 p-6 justify-start flex-wrap">
                    {data.step_data && data.step_data.map((question, index) => (
                        <QuestionCard
                            key={index}
                            question={question}
                            edit={edit}
                            mediaNames={mediaNames}
                            onQuestionChange={(updatedQuestion) => handleQuestionChange(index, updatedQuestion)}
                            navigate={navigate}
                        />
                    ))}
                    {edit && (
                        <button
                            style={{ width: "350px", minHeight: "400px" }}
                            className="flex flex-col justify-center items-center overflow-hidden rounded-lg bg-secondary shadow-md dark:bg-gray-800 hover:bg-opacity-80 transition-colors duration-200"
                            onClick={addNewQuestion}
                        >
                            <MdOutlineAddCircleOutline size={150} fill="#333"/>
                            <span className="mt-4 text-lg font-semibold">Add New Question</span>
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};