import {QuestionHeader} from "./QuestionCard.QuestionHeader"
import {ScriptOrAudio} from "./QuestionCard.ScriptArea"
import {ResponseTable} from "./QuestionCard.ResponseTable"

export const QuestionCard = ({ question, edit, mediaNames, onQuestionChange, navigate }) => {
    const handleChange = (field, value) => {
        onQuestionChange({ ...question, [field]: value });
    };

    return (
        <div className="w-64 bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden">
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
    );
};