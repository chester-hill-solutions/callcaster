import { useNavigate } from "@remix-run/react";
import { QuestionCard } from "./QuestionCard";
import { useState, useRef, useEffect } from "react";
import { MdOutlineAddCircleOutline } from "react-icons/md";

export const IVRSettings = ({ pageData, edit = false, mediaNames = [], onChange }) => {
    const navigate = useNavigate();
    const [data, setData] = useState(pageData[0]);
    const flowRef = useRef(null);

    useEffect(() => {
        if (flowRef.current) {
            drawConnections();
        }
    }, [data]);

    const handleQuestionChange = (questionIndex, updatedQuestion) => {
        const newStepData = [...data.campaignDetails.step_data];
        newStepData[questionIndex] = updatedQuestion;
        const newData = {
            ...data,
            campaignDetails: {
                ...data.campaignDetails,
                step_data: newStepData
            }
        }
        setData(newData);
        onChange(newData);
    };

    const addNewQuestion = () => {
        const newQuestion = {
            step: `${data.campaignDetails.step_data?.length + 1}`,
            name: `New Question ${data.campaignDetails.step_data?.length + 1}`,
            speechType: "synthetic",
            say: "Enter your question here",
            responseType: "dtmf",
            nextStep: {}
        };
        const existingData = data.campaignDetails.step_data || [];
        const newStepData = [...existingData, newQuestion];
        const newData = {
            ...data,
            campaignDetails: {
                ...data.campaignDetails,
                step_data: newStepData
            }
        }
        setData(newData);
        onChange(newData);
    };

    const drawConnections = () => {
        const canvas = document.getElementById('flow-canvas');
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        data.campaignDetails.step_data.forEach((question, index) => {
            const fromElement = document.getElementById(`question-${index}`);
            if (question.nextStep) {
                Object.values(question.nextStep).forEach(nextStep => {
                    const toElement = document.getElementById(`question-${nextStep}`);
                    if (fromElement && toElement) {
                        drawArrow(ctx, fromElement, toElement);
                    }
                });
            }
        });
    };

    const drawArrow = (ctx, from, to) => {
        const fromRect = from.getBoundingClientRect();
        const toRect = to.getBoundingClientRect();
        const flowRect = flowRef.current.getBoundingClientRect();

        const startX = fromRect.left + fromRect.width / 2 - flowRect.left;
        const startY = fromRect.top + fromRect.height - flowRect.top;
        const endX = toRect.left + toRect.width / 2 - flowRect.left;
        const endY = toRect.top - flowRect.top;

        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.stroke();

        const angle = Math.atan2(endY - startY, endX - startX);
        ctx.beginPath();
        ctx.moveTo(endX, endY);
        ctx.lineTo(endX - 10 * Math.cos(angle - Math.PI / 6), endY - 10 * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(endX - 10 * Math.cos(angle + Math.PI / 6), endY - 10 * Math.sin(angle + Math.PI / 6));
        ctx.closePath();
        ctx.fill();
    };

    return (
        <div className="relative w-full h-full overflow-auto" ref={flowRef}>
            <canvas id="flow-canvas" className="absolute top-0 left-0 w-full h-full" />
            <div className="relative z-10 p-4 flex flex-wrap ">
                {data.campaignDetails?.step_data && data.campaignDetails?.step_data.map((question, index) => (
                    <div key={index} id={`question-${index}`} className="relative">
                        <QuestionCard
                            question={question}
                            edit={edit}
                            mediaNames={mediaNames}
                            onQuestionChange={(updatedQuestion) => handleQuestionChange(index, updatedQuestion)}
                            navigate={navigate}
                        />
                    </div>
                ))}
                {edit && (
                    <button
                        className="flex flex-col justify-center items-center w-64 h-64 rounded-lg bg-secondary shadow-md dark:bg-gray-800 hover:bg-opacity-80 transition-colors duration-200"
                        onClick={addNewQuestion}
                    >
                        <MdOutlineAddCircleOutline size={64} className="text-gray-600 dark:text-gray-400" />
                        <span className="mt-4 text-lg font-semibold">Add New Question</span>
                    </button>
                )}
            </div>
        </div>
    );
};