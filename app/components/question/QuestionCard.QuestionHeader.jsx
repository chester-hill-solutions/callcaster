import { VoxTypeSelector } from "~/components/settings/Settings.VoxTypeSelector";
import { MdBubbleChart, MdMic } from "react-icons/md";

export const QuestionHeader = ({ question, edit, onNameChange, onSpeechTypeChange }) => {
    return (
        <div className="flex justify-between">
            <div className="flex items-center justify-between bg-[#88cfff] p-4 dark:bg-gray-700"
                style={{ maxWidth: "60%" }}
            >
                {edit ? (
                    <>
                        <h2 className="text-lg font-semibold uppercase text-gray-800 dark:text-white">
                            {question.step}
                        </h2>
                        {question.step !== 'voicemail' && 
                            <input 
                                className="text-lg font-semibold uppercase bg-transparent border-0 border-b-2 border-primary w-[80%] text-gray-800 dark:text-white" 
                                style={{border:"none", borderBottom:"2px dashed hsl(var(--brand-primary))"}}
                                value={question.name} 
                                onChange={(e) => onNameChange(e.target.value)}
                            />
                        }
                    </>
                ) : (
                    <h2 className="text-lg font-semibold uppercase text-gray-800 dark:text-white">
                        {question.step} {question.name}
                    </h2>
                )}
            </div>
            {edit ? (
                <div className="0 flex items-stretch">
                    <VoxTypeSelector
                        value={question.speechType}
                        onChange={onSpeechTypeChange}
                    />
                </div>
            ) : (
                <div className="0 flex flex-col items-center text-xs uppercase p-4">
                    {question.speechType === "synthetic" ? (
                        <MdBubbleChart size={24} />
                    ) : (
                        <MdMic size={24} />
                    )}
                    {question.speechType}
                </div>
            )}
        </div>
    );
};