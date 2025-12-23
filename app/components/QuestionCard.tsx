import {QuestionHeader} from "./QuestionCard.QuestionHeader"
import {ScriptOrAudio} from "./QuestionCard.ScriptArea"
import {ResponseTable} from "./QuestionCard.ResponseTable"

// Define the question type structure
interface Question {
  id: string;
  name: string;
  step: string;
  say: string;
  speechType: "recorded" | "synthetic";
  nextStep: Record<string, string> | null;
}

interface QuestionCardProps {
  question: Question;
  edit: boolean;
  mediaNames: Array<{ name: string }>;
  onQuestionChange: (question: Question) => void;
  navigate: (path: string) => void;
}

export const QuestionCard = ({ question, edit, mediaNames, onQuestionChange, navigate }: QuestionCardProps) => {
    const handleChange = (field: keyof Question, value: string | Record<string, string> | null) => {
        onQuestionChange({ ...question, [field]: value });
    };

    return (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden" style={{width:'10rem'}}>
            <QuestionHeader
                question={question}
                edit={edit}
                onNameChange={(value: string) => handleChange("name", value)}
                onSpeechTypeChange={(value: "recorded" | "synthetic") => handleChange("speechType", value)}
            />
            <div className="p-4">
                <ScriptOrAudio
                    question={question}
                    edit={edit}
                    mediaNames={mediaNames}
                    onScriptChange={(value: string) => handleChange("say", value)}
                    onAudioChange={(value: string) => handleChange("say", value)}
                    navigate={navigate}
                />
                <ResponseTable
                    question={question}
                    edit={edit}
                    onNextStepChange={(value: Record<string, string> | null) => handleChange("nextStep", value)}
                />
            </div>
        </div>
    );
};