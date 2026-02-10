import { useRef, useState, useEffect } from "react";
import Result from "@/components/call-list/records/participant/Result";
import QuestionBlockOption from "./CampaignSettings.Script.QuestionBlock.Option";
import { GrAddCircle, GrSubtractCircle } from "react-icons/gr";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Block, BlockOption } from "@/lib/types";

const questionTypes = [
  { value: "textarea", label: "Text Input" },
  { value: "infotext", label: "Static Text" },
  { value: "radio", label: "Radio" },
  { value: "dropdown", label: "Dropdown" },
  { value: "boolean", label: "Boolean" },
  { value: "multi", label: "Multi-Select" },
];
interface QuestionHeaderProps {
  questionId: bigint;
  removeQuestion: (questionId: bigint) => void;
  title: string;
  onClick: (questionId: bigint | null) => void;
  isOpen: boolean;
  moveUp: (questionId: bigint) => void;
  moveDown: (questionId: bigint) => void;
}

const QuestionHeader = ({
  questionId,
  removeQuestion,
  title,
  onClick,
  isOpen,
  moveUp,
  moveDown,
}: QuestionHeaderProps) => (
  <div className="flex items-center">
    <div className="item-center flex flex-auto items-center gap-2">
      <div className="flex flex-col justify-center">
        <button onClick={() => moveUp(questionId)}>
          <ArrowUp />
        </button>
        <button onClick={() => moveDown(questionId)}>
          <ArrowDown />
        </button>
      </div>
      <div
        className="flex min-h-10 flex-auto items-center"
        onClick={() => onClick(isOpen ? null : questionId)}
      >
        <h3 className="font-Zilla-Slab text-xl">{title || String(questionId)}</h3>
      </div>
    </div>
    <button
      onClick={() => removeQuestion(questionId)}
      className=" text-red-900"
    >
      <GrSubtractCircle />
    </button>
  </div>
);

type Question = Omit<Block, "id"> & {
  id: bigint;
  title: string;
  content: string;
  type: Block["type"];
  options?: (BlockOption & { Icon?: string })[];
};

interface QuestionInputsProps {
  question: Question;
  handleTextChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  handleTypeChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
}

const QuestionInputs = ({ question, handleTextChange, handleTypeChange }: QuestionInputsProps) => (
  <div className="flex w-1/2 flex-col gap-2">
    <div className="flex flex-col">
      <label htmlFor={`${question.id}-title`}>Title</label>
      <input
        type="text"
        name="title"
        id={`${question.id}-title`}
        value={question.title}
        onChange={handleTextChange}
        required={true}
      />
    </div>
    <div className="flex flex-col">
      <label htmlFor={`${question.id}-description`}>Descriptive Text</label>
      <textarea
        rows={5}
        placeholder="Text that can be used to describe the question, or provide a direct script to the caller"
        style={{ resize: "none" }}
        name="content"
        id={`${question.id}-content`}
        value={question.content}
        onChange={handleTextChange}
        required={true}
      />
    </div>
    <div className="flex flex-col">
      <label htmlFor={`${question.id}-type`}>Question Type</label>
      <select
        name="type"
        id={`${question.id}-type`}
        value={question.type}
        onChange={handleTypeChange}
      >
        {questionTypes.map((type) => (
          <option key={type.value} value={type.value}>
            {type.label}
          </option>
        ))}
      </select>
    </div>
  </div>
);

type ScriptData = {
  blocks?: Record<string, Block>;
  pages?: Record<string, { title: string; blocks: string[] }>;
};

interface OptionsSectionProps {
  question: Question;
  handleAddOption: () => void;
  handleRemoveOption: (option: BlockOption) => void;
  handleOptionChange: (index: number, e: React.ChangeEvent<HTMLInputElement>) => void;
  handleIconChange: (params: { index: number; iconName: string }) => void;
  scriptData: ScriptData;
  addNewBlock: () => void;
  handleNextChange: (index: number, value: string) => void;
}

const OptionsSection = ({
  question,
  handleAddOption,
  handleRemoveOption,
  handleOptionChange,
  handleIconChange,
  scriptData,
  addNewBlock,
  handleNextChange,
}: OptionsSectionProps) =>
  question.options && (
    <div>
      <div className="flex items-center gap-2">
        <h4>Options</h4>
        <button onClick={handleAddOption}>
          <GrAddCircle />
        </button>
      </div>
      <div>
        {question.options.map((option: BlockOption, i: number) => (
          <QuestionBlockOption
            key={`${question.id}-option-${i}`}
            index={i}
            block={{ id: question.id.toString(), type: question.type }}
            option={option}
            handleChange={handleOptionChange}
            handleIconChange={handleIconChange}
            scriptData={scriptData}
            addNewBlock={addNewBlock}
            handleNextChange={handleNextChange}
            handleRemoveOption={handleRemoveOption}
          />
        ))}
      </div>
    </div>
  );
interface PreviewSectionProps {
  question: Question;
}

const PreviewSection = ({ question }: PreviewSectionProps) => (
  <div className="relative flex w-1/2 flex-col justify-center bg-background p-2">
    <div style={{ scale: ".7" }}>
      <Result
        action={() => null}
        initResult={null}
        questions={{ ...question, id: String(question.id) }}
        questionId={String(question.id)}
        disabled={false}
      />
    </div>
  </div>
);

interface CampaignSettingsScriptQuestionBlockProps {
  question: Question;
  removeQuestion: (questionId: bigint) => void;
  moveUp: (questionId: bigint) => void;
  moveDown: (questionId: bigint) => void;
  dispatchState: (question: Question) => void;
  openQuestion: bigint | null;
  setOpenQuestion: (questionId: bigint | null) => void;
  scriptData: ScriptData;
  addNewBlock: () => void;
  handleNextChange: (index: number, value: string) => void;
}

export default function CampaignSettingsScriptQuestionBlock({
  question: initQuestion,
  removeQuestion,
  moveUp,
  moveDown,
  dispatchState,
  openQuestion,
  setOpenQuestion,
  scriptData,
  addNewBlock,
  handleNextChange,
}: CampaignSettingsScriptQuestionBlockProps) {
  const [question, setQuestion] = useState(initQuestion);
  const focusedInputRef = useRef(null);
  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const newState = { ...question, [e.target.name]: e.target.value };
    setQuestion(newState);
    dispatchState(newState);
  };

  const handleTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.currentTarget.value;
    const newState = {
      ...question,
      type: val as Block["type"],
      options:
        val === "radio" || val === "multi" || val === "dropdown"
          ? question?.options || [{ content: "", value: "", next: "" }]
          : [{ next: "" }],
    };
    setQuestion(newState);
    dispatchState(newState);
  };

  const handleAddOption = () => {
    const newOption: BlockOption & { Icon?: string } = {
      value: `option_${question.options?.length || 0}`,
      content: `Option ${(question.options?.length || 0) + 1}`,
      next: "",
    };
    const updatedOptions = [...(question.options || []), newOption];
    const updatedQuestion = { ...question, options: updatedOptions };
    setQuestion(updatedQuestion);
    dispatchState(updatedQuestion);
  };

  const handleRemoveOption = (optionToRemove: BlockOption) => {
    const newState = {
      ...question,
      options: question.options?.filter((option: BlockOption) => option !== optionToRemove) || [],
    };
    setQuestion(newState);
    dispatchState(newState);
  };

  const handleIconChange = ({ index, iconName }: { index: number; iconName: string }) => {
    const newOptions = [...(question.options || [])];
    const prev = newOptions[index];
    newOptions[index] = {
      ...prev,
      value: prev?.value ?? "",
      content: prev?.content ?? "",
      next: prev?.next ?? "",
      Icon: iconName,
    };
    const newState = { ...question, options: newOptions };
    setQuestion(newState);
    dispatchState(newState);
  };

  const handleOptionChange = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const newContent = e.target.value;
    const newValue = newContent?.toLowerCase().replace(/ /g, "-");
    const newOptions = [...(question.options || [])];
    const prev = newOptions[index];
    newOptions[index] = {
      ...prev,
      content: newContent,
      value: newValue,
      next: prev?.next ?? "",
    };
    const newState = { ...question, options: newOptions };
    setQuestion(newState);
    dispatchState(newState);
  };

  useEffect(() => {
    if (focusedInputRef.current) {
      const input = document.getElementById(focusedInputRef.current);
      if (input) {
        input.focus();
      }
      focusedInputRef.current = null;
    }
  }, [question.id]);

  return (
    <div className="border rounded-lg p-4 mb-4">
      <QuestionHeader
        questionId={question.id}
        removeQuestion={removeQuestion}
        title={question.title}
        onClick={setOpenQuestion}
        isOpen={openQuestion === question.id}
        moveUp={moveUp}
        moveDown={moveDown}
      />
      {openQuestion === question.id && (
        <div className="mt-4 flex gap-4">
          <QuestionInputs
            question={question}
            handleTextChange={handleTextChange}
            handleTypeChange={handleTypeChange}
          />
          <OptionsSection
            question={question}
            handleAddOption={handleAddOption}
            handleRemoveOption={handleRemoveOption}
            handleOptionChange={handleOptionChange}
            handleIconChange={handleIconChange}
            scriptData={scriptData}
            addNewBlock={addNewBlock}
            handleNextChange={handleNextChange}
          />
          <PreviewSection question={question} />
        </div>
      )}
    </div>
  );
}
