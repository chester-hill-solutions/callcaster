import { useRef, useState, useEffect } from "react";
import Result from "@/components/call-list/records/CallContact/Result";
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

type Question = Block & {
  id: bigint;
  title: string;
  content: string;
  type: Block["type"];
  options?: BlockOption[];
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
        {question.options.map((option, i) => (
          <QuestionBlockOption
            key={`${question.id}-option-${i}`}
            index={i}
            block={question}
            option={option}
            handleRemoveOption={handleRemoveOption}
            handleChange={handleOptionChange}
            handleIconChange={handleIconChange}
            scriptData={scriptData}
            addNewBlock={addNewBlock}
            handleNextChange={handleNextChange}
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
        questions={question}
        questionId={question.id}
      />
    </div>
    <div className="absolute bottom-2 text-xs">Preview</div>
  </div>
);

interface CampaignSettingsScriptQuestionBlockProps {
  question: Question;
  removeQuestion: (questionId: bigint) => void;
  moveUp: (questionId: bigint) => void;
  moveDown: (questionId: bigint) => void;
  dispatchState: (question: Question) => void;
  openQuestion: string | null;
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
      type: val,
      options:
        val === "radio" || val === "multi" || val === "dropdown"
          ? question?.options || [{ content: "", value: "", next: 0 }]
          : [{ next: 0 }],
    };
    setQuestion(newState);
    dispatchState(newState);
  };

  const handleAddOption = () => {
    const newState = {
      ...question,
      options: [
        ...question.options,
        {
          content: "",
          value: `option-${question.options.length + 1}`,
          next: 0,
          ...(question.type === "single-select" && { Icon: "SupportButton" }),
        },
      ],
    };
    setQuestion(newState);
    dispatchState(newState);
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
    const newOptions = [...question.options];
    newOptions[index] = {
      ...newOptions[index],
      Icon: iconName,
    };
    const newState = { ...question, options: newOptions };
    setQuestion(newState);
    dispatchState(newState);
  };

  const handleOptionChange = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const newContent = e.target.value;
    const newValue = newContent?.toLowerCase().replace(/ /g, "-");
    const newOptions = [...question.options];
    newOptions[index] = {
      ...newOptions[index],
      content: newContent,
      value: newValue,
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

  const isOpen = openQuestion === String(question.id);
  return (
    <div
      className="relative mx-4 my-1 flex flex-col justify-center gap-2 bg-card p-2"
      style={{
        borderRadius: "20px",
      }}
    >
      <QuestionHeader
        questionId={question.id}
        removeQuestion={removeQuestion}
        title={question.title}
        onClick={setOpenQuestion}
        isOpen={isOpen}
        moveUp={moveUp}
        moveDown={moveDown}
      />
      <div
        style={{
          height: isOpen ? "unset" : "0px",
          overflow: isOpen ? "unset" : "hidden",
        }}
        className="px-4"
      >
        <div className="flex justify-between gap-4">
          <QuestionInputs
            question={question}
            handleTextChange={handleTextChange}
            handleTypeChange={handleTypeChange}
          />
          <PreviewSection question={question} />
        </div>
        <div className="p-4">
          <OptionsSection
            question={question}
            scriptData={scriptData}
            handleAddOption={handleAddOption}
            handleRemoveOption={handleRemoveOption}
            handleOptionChange={handleOptionChange}
            handleIconChange={handleIconChange}
            addNewBlock={addNewBlock}
            handleNextChange={handleNextChange}
          />
        </div>
      </div>
    </div>
  );
}
