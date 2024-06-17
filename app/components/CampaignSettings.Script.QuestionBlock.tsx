import { useEffect, useState } from "react";
import Result from "./CallList/CallContact/Result";
import QuestionBlockOption from "./CampaignSettings.Script.QuestionBlock.Option";
import { GrAddCircle, GrSubtractCircle } from "react-icons/gr";
import { deepEqual } from "~/lib/utils";
import { ArrowDown, ArrowUp } from "lucide-react";

const QuestionHeader = ({ questionId, removeQuestion, title }) => (
  <div className="flex items-center justify-between">
    <div className="item-center flex items-center gap-2">
      <div className="flex flex-col">
        <button onClick={() => moveUp(index)}>
          <ArrowUp />
        </button>
        <button onClick={() => moveDown(questionId)}>
          <ArrowDown />
        </button>
      </div>

      <h3>{title}</h3>
    </div>
    <button onClick={() => removeQuestion(questionId)}>
      <GrSubtractCircle />
    </button>
  </div>
);

const QuestionInputs = ({ question, handleTextChange, handleTypeChange }) => (
  <div className="flex w-1/2 flex-col gap-2">
    {[
      { label: "Identifier", name: "id", value: question.id, required: true },
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
        {[
          "textarea",
          "textblock",
          "titleblock",
          "radio",
          "dropdown",
          "boolean",
          "multi",
        ].map((type) => (
          <option key={type} value={type}>
            {type.charAt(0).toUpperCase() +
              type.slice(1).replace(/block/, " Block")}
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
  <div className="relative flex w-1/2 flex-col justify-center bg-white p-2">
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
  setChanged,
  index,
  moveUp,
  moveDown,
  dispatchState,
  openQuestion,
}) {
  const [question, setQuestion] = useState(initQuestion);

  const handleTextChange = (e) => {
    setQuestion((curr) => ({
      ...curr,
      [e.target.name]: e.target.value,
    }));
  };

  const handleTypeChange = (e) => {
    const val = e.currentTarget.value;
    setQuestion((curr) => ({
      ...curr,
      type: val,
      ...((val === "radio" || val === "multi" || val === "dropdown") && {
        options: [],
      }),
    }));
  };

  const handleAddOption = () => {
    setQuestion((curr) => ({
      ...curr,
      options: [
        ...curr.options,
        {
          value: `option-${curr.options.length + 1}`,
          label: "",
          ...(question.type === "radio" && { Icon: "SupportButton" }),
        },
      ],
    }));
  };

  const handleRemoveOption = (option) => {
    setQuestion((curr) => ({
      ...curr,
      options: [...curr.options.filter((opt) => opt.value !== option.value)],
    }));
  };

  const handleIconChange = ({ index, iconName }) => {
    setQuestion((curr) => {
      const updatedOptions = [...curr.options];
      updatedOptions[index] = {
        ...updatedOptions[index],
        Icon: iconName,
      };
      return {
        ...curr,
        options: updatedOptions,
      };
    });
  };

  const handleOptionChange = (index, e) => {
    const newLabel = e.target.value;
    const newValue = newLabel?.toLowerCase().replace(/ /g, "-");

    setQuestion((curr) => {
      const updatedOptions = [...curr.options];
      updatedOptions[index] = {
        ...updatedOptions[index],
        label: newLabel,
        value: newValue,
      };
      return {
        ...curr,
        options: updatedOptions,
      };
    });
  };

  return (
    <div
      key={question.id}
      className="relative flex flex-col gap-2 bg-gray-100 p-6 py-2"
    >
      <QuestionHeader
        questionId={question.id}
        removeQuestion={removeQuestion}
        title={question.title}
      />
      <div
        style={{
          height: `${openQuestion === question.id ? "height" : "0px"}`,
          overflow: "hidden",
        }}
      >
        <div className="flex justify-between gap-4">
          <QuestionInputs
            question={question}
            handleTextChange={handleTextChange}
            handleTypeChange={handleTypeChange}
          />
          <PreviewSection question={question} />
        </div>
        <OptionsSection
          question={question}
          handleAddOption={handleAddOption}
          handleRemoveOption={handleRemoveOption}
          handleOptionChange={handleOptionChange}
          handleIconChange={handleIconChange}
        />
      </div>
    </div>
  );
}
