import { QuestionHeader } from "./QuestionCard.QuestionHeader";
import { ScriptOrAudio } from "./QuestionCard.ScriptArea";
import { ResponseTable } from "./QuestionCard.ResponseTable";

export const QuestionCard = ({ question, edit, mediaNames, onQuestionChange, navigate }) => {
    
    const handleChange = (field, value) => {
        onQuestionChange({ ...question, [field]: value });
    };

    return (
        <div
            style={{ width: "350px", minHeight: "400px" }}
            className="flex flex-col overflow-hidden rounded-lg bg-secondary shadow-md dark:bg-gray-800"
        >
            <div className="flex flex-col gap-4">
                <QuestionHeader
                    question={question}
                    edit={edit}
                    onNameChange={(value) => handleChange("name", value)}
                    onSpeechTypeChange={(value) => handleChange("speechType", value)}
                />
                <div className="p-4">
                    <ScriptOrAudio
                        question={question}
                        edit={edit}
                        mediaNames={mediaNames}
                        onScriptChange={(value) => handleChange("say", value)}
                        onAudioChange={(value) => handleChange("say", value)}
                        navigate={navigate}
                    />
                    <ResponseTable
                        question={question}
                        edit={edit}
                        onNextStepChange={(value) => handleChange("nextStep", value)}
                    />
                </div>
            </div>
        </div>
    );
};