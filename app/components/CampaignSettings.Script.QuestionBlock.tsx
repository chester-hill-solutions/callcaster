import { useRef, useState, useEffect } from "react";
import Result from "./CallList/CallContact/Result";
import QuestionBlockOption from "./CampaignSettings.Script.QuestionBlock.Option";
import { GrAddCircle, GrSubtractCircle } from "react-icons/gr";
import { ArrowDown, ArrowUp } from "lucide-react";

const questionTypes = [
  { value: "textarea", label: "Text Input" },
  { value: "infotext", label: "Static Text" },
  { value: "radio", label: "Radio" },
  { value: "dropdown", label: "Dropdown" },
  { value: "boolean", label: "Boolean" },
  { value: "multi", label: "Multi-Select" },
];
const QuestionHeader = ({
  questionId,
  removeQuestion,
  title,
  onClick,
  isOpen,
  moveUp,
  moveDown,
}: {
  questionId: bigint;
  removeQuestion: (arg0: bigint) => null;
  title: string;
  onClick: (arg0: bigint) => null;
  isOpen: boolean;
  moveUp: (arg0: bigint) => null;
  moveDown: (arg0: bigint) => null;
}) => (
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
        <h3 className="font-Zilla-Slab text-xl">{title || questionId}</h3>
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

const QuestionInputs = ({ question, handleTextChange, handleTypeChange }) => (
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
        name="text"
        id={`${question.id}-text`}
        value={question.text}
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

const OptionsSection = ({
  question,
  handleAddOption,
  handleRemoveOption,
  handleOptionChange,
  handleIconChange,
  allQuestions,
  addNewQuestion,
  handleNextChange,
}) =>
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
            question={question}
            option={option}
            handleRemoveOption={handleRemoveOption}
            handleChange={handleOptionChange}
            handleIconChange={handleIconChange}
            allQuestions={allQuestions}
            addNewQuestion={addNewQuestion}
            handleNextChange={handleNextChange}
          />
        ))}
      </div>
    </div>
  );
const PreviewSection = ({ question }) => (
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

export default function CampaignSettingsScriptQuestionBlock({
  question: initQuestion,
  removeQuestion,
  moveUp,
  moveDown,
  dispatchState,
  openQuestion,
  setOpenQuestion,
  allQuestions,
  addNewQuestion,
  handleNextChange,
}) {
  const [question, setQuestion] = useState(initQuestion);
  const focusedInputRef = useRef(null);
  const handleTextChange = (e) => {
    const newState = { ...question, [e.target.name]: e.target.value };
    setQuestion(newState);
    dispatchState(newState);
  };

  const handleTypeChange = (e) => {
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

  const handleRemoveOption = (optionToRemove) => {
    const newState = {
      ...question,
      options: question.options.filter((option) => option !== optionToRemove),
    };
    setQuestion(newState);
    dispatchState(newState);
  };

  const handleIconChange = ({ index, iconName }) => {
    const newOptions = [...question.options];
    newOptions[index] = {
      ...newOptions[index],
      Icon: iconName,
    };
    const newState = { ...question, options: newOptions };
    setQuestion(newState);
    dispatchState(newState);
  };

  const handleOptionChange = (index, e) => {
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
            allQuestions={allQuestions}
            handleAddOption={handleAddOption}
            handleRemoveOption={handleRemoveOption}
            handleOptionChange={handleOptionChange}
            handleIconChange={handleIconChange}
            addNewQuestion={addNewQuestion}
            handleNextChange={handleNextChange}
          />
        </div>
      </div>
    </div>
  );
}
