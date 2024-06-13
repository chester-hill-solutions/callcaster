import { useState } from "react";
import Result from "./CallList/CallContact/Result";
import QuestionBlockOption from "./CampaignSettings.Script.QuestionBlock.Option";
import { GrAddCircle } from "react-icons/gr";
type questionOptions = {
  label: string;
  value: string;
  Icon: string;
};

type question = {
  id: string;
  title: string;
  text: string;
  type:
    | "textarea"
    | "textblock"
    | "titleblock"
    | "radio"
    | "dropdown"
    | "boolean"
    | "multi";
  order: bigint;
  options?: Array<questionOptions>;
};

export default function CampaignSettingsScriptQuestionBlock({
  question: initQuestion,
}: {
  question: question;
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
      options: [...curr.options, { value: `option-${curr.options.length + 1}`, label: "", ...(question.type === 'radio' && {Icon: 'SupportButton'}) }],
    }));
  };
  const handleRemoveOption = (option) => {
    setQuestion((curr) => ({
      ...curr,
      options: [...curr.options.filter((opt) => opt.value !== option.value)],
    }));
  };
  const handleOptionChange = (index, e) => {
    const newLabel = e.target.value;
    const newValue = newLabel.toLowerCase().replace(/ /g, '-');
    setQuestion((curr) => {
        const updatedOptions = [...curr.options];
        updatedOptions[index] = {
            ...updatedOptions[index],
            value: newValue,
            label: newLabel
        };
        return {
            ...curr,
            options: updatedOptions
        };
    });
};

  return (
    <div
      key={question.id}
      className="flex gap-2 py-2"
      style={{
        justifyContent: "space-between",
        background: "#f1f1f1",
        padding: "24px 16px",
      }}
    >
      <div className="w-[50%]">
        <div className="flex flex-col">
          <label htmlFor={`${question.id}-id`}>Identifier</label>
          <input
            type="text"
            name={`id`}
            id={`${question.id}-id`}
            value={question.id}
            onChange={handleTextChange}
            required
          />
        </div>
        <div className="flex flex-col">
          <label htmlFor={`${question.id}-title`}>Title</label>
          <input
            type="text"
            name={`title`}
            id={`${question.id}-title`}
            value={question.title}
            onChange={handleTextChange}
          />
        </div>
        <div className="flex flex-col">
          <label htmlFor={`${question.id}-text`}>Descriptive Text</label>
          <input
            type="text"
            name={`text`}
            id={`${question.id}-text`}
            value={question.text}
            onChange={handleTextChange}
          />
        </div>
        <div className="flex flex-col">
          <label htmlFor={`${question.id}-type`}>Question Type</label>
          <select
            name={`${question.id}-type`}
            id={`${question.id}-type`}
            value={question.type}
            onChange={handleTypeChange}
          >
            <option value={"textarea"}>Text Area</option>
            <option value={"textblock"}>Text Block</option>
            <option value={"titleblock"}>Title Block</option>
            <option value={"radio"}>Radio Select</option>
            <option value={"dropdown"}>Dropdown Menu</option>
            <option value={"boolean"}>Boolean/Toggle</option>
            <option value={"multi"}>Multi-Select</option>
          </select>
        </div>
        {question.options && (
          <div>
            <div className="flex gap-2" style={{ alignItems: "center" }}>
              <h4>Options</h4>
              <button onClick={handleAddOption}>
                <GrAddCircle />
              </button>
            </div>
            <div>
              {question.options.map((option, i) => (
                <QuestionBlockOption {...{question, option, handleRemoveOption, index: i, handleChange: handleOptionChange}} key={`${question.id}-option-${i}`}/>
              ))}
            </div>
          </div>
        )}
      </div>
      <div
        className="relative flex flex-col p-2"
        style={{ background: "#fff", width: "50%", justifyContent: "center" }}
      >
        <div style={{ scale: ".7" }}>
          <Result
            action={() => null}
            initResult={null}
            questions={question}
            questionId={question.id}
          />
        </div>
        <div
          style={{ position: "absolute", bottom: "10px", fontSize: "x-small" }}
        >
          Preview
        </div>
      </div>
    </div>
  );
}
