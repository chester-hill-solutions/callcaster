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
  { value: "multi", label: "Multi-Select" }
];
const QuestionHeader = ({
  questionId,
  removeQuestion,
  title,
  onClick,
  isOpen,
  moveUp,
  moveDown,
  index,
}: {
  questionId: bigint;
  removeQuestion: (arg0: bigint) => null;
  title: string;
  onClick: (arg0: bigint) => null;
  isOpen: boolean;
  moveUp: (arg0: bigint) => null;
  moveDown: (arg0: bigint) => null;
  index: bigint;
}) => (
  <div className="flex items-center">
    <div className="item-center flex flex-auto items-center gap-2">
      <div className="flex flex-col justify-center">
        <button onClick={() => moveUp(index)}>
          <ArrowUp />
        </button>
        <button onClick={() => moveDown(index)}>
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

    {[
      { label: "Title", name: "title", value: question.title },
      { label: "Descriptive Text", name: "text", value: question.text },
    ].map(({ label, name, value, required }) => (
      <div key={name} className="flex flex-col">
        <label htmlFor={`${question.id}-${name}`}>{label}</label>
        <input
          type="text"
          name={name}
          id={`${question.id}-${name}`}
          value={value}
          onChange={handleTextChange}
          required={required}
        />
      </div>
    ))}
    <div className="flex flex-col">
      <label htmlFor={`${question.id}-type`}>Question Type</label>
      <select
        name="type"
        id={`${question.id}-type`}
        value={question.type}
        onChange={handleTypeChange}
      >
        {questionTypes.map(
          (type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ),
        )}
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
  index,
  moveUp,
  moveDown,
  dispatchState,
  openQuestion,
  setOpenQuestion,
}) {
  const [question, setQuestion] = useState(initQuestion);
  const focusedInputRef = useRef(null);

  const handleTextChange = (e) => {
    const oldState = { ...question };
    const newState = { ...question, [e.target.name]: e.target.value };
    setQuestion(newState);
    dispatchState({ oldState, newState });
  };

  const handleTypeChange = (e) => {
    const val = e.currentTarget.value;
    const oldState = { ...question };
    const newState = {
      ...question,
      type: val,
      ...((val === "radio" || val === "multi" || val === "dropdown") ?{
        options: question?.options || [],
      } : {options: []}),
    };
    if (!(val === "radio" || val === "multi" || val === "dropdown")) delete newState.options
    setQuestion(newState);
    dispatchState({ oldState, newState });
  };

  const handleAddOption = () => {
    const oldState = { ...question };
    const newState = {
      ...question,
      options: [
        ...question.options,
        {
          value: `option-${question.options.length + 1}`,
          label: "",
          ...(question.type === "radio" && { Icon: "SupportButton" }),
        },
      ],
    };
    setQuestion(newState);
    dispatchState({ oldState, newState });
  };

  const handleRemoveOption = (option) => {
    setQuestion((curr) => ({
      ...curr,
      options: [...curr.options.filter((opt) => opt.value !== option.value)],
    }));
  };

  const handleIconChange = ({ index, iconName }) => {
    const oldState = { ...question };
    const newOptions = [...oldState.options];
    newOptions[index] = {
      ...newOptions[index],
      Icon: iconName,
    };
    const newState = { ...oldState, options: newOptions };
    setQuestion(newState);
    dispatchState({ oldState, newState });
  };

  const handleOptionChange = (index, e) => {
    const newLabel = e.target.value;
    const newValue = newLabel?.toLowerCase().replace(/ /g, "-");
    const oldState = { ...question };
    const newOptions = [...oldState.options];
    newOptions[index] = {
      ...newOptions[index],
      label: newLabel,
      value: newValue,
    };
    const newState = { ...oldState, options: newOptions };
    setQuestion(newState);
    dispatchState({ oldState, newState });
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

  const isOpen = openQuestion === question.id;

  return (
    <div
      key={question.id}
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
        index={index}
      />
      <div
        style={{
          height: isOpen ? "unset" : "0px",
          overflow: isOpen ? "unset": "hidden",
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
            handleAddOption={handleAddOption}
            handleRemoveOption={handleRemoveOption}
            handleOptionChange={handleOptionChange}
            handleIconChange={handleIconChange}
          />
        </div>
      </div>
    </div>
  );
}
