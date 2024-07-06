import { useEffect, useState } from "react";
import SupportButton from "./SupportButton";
import { iconMapping, IconType } from "./Result.IconMap";
import {
  ScriptBlock,
  ScriptBlockBaseOption,
  ScriptBlockRadioOption,
} from "~/lib/database.types";

interface ResultProps {
  action: (response: { column: string; value: any }) => void;
  initResult: any;
  questions: ScriptBlock;
  questionId: string;
  disabled: boolean;
}

const Result = ({
  action,
  initResult = null,
  questions,
  questionId,
  disabled,
}: ResultProps) => {
  const [result, setResult] = useState<string | boolean | string[]>(
    initResult || "",
  );

  useEffect(() => {
    setResult(initResult || (questions.type === "multi" ? [] : ""));
  }, [initResult, questions.type]);

  const handleChange = (id: string, value: string | boolean) => {
    const newValue = result === value ? "" : value;
    setResult(newValue);
    action({ column: id, value: newValue });
  };

  const handleMultiChange = (id: string, value: string, isChecked: boolean) => {
    const currentResult = Array.isArray(result) ? result : [];
    const newArr = isChecked
      ? [...currentResult, value]
      : currentResult.filter((item) => item !== value);
    setResult(newArr);
    action({ column: id, value: newArr });
  };

  const renderIcon = (option: ScriptBlockRadioOption) => {
    if (option.Icon === "SupportButton") {
      return (
        <SupportButton
          key={option.value}
          option={option}
          handleChange={() => handleChange(questions.id, option.value || "")}
          current={result as string}
        />
      );
    }

    const IconComponent = iconMapping[option.Icon as IconType];
    if (!IconComponent) {
      //console.error(`Icon component ${option.Icon} is not found in iconMapping`);
      return (
        <SupportButton
          key={option.value}
          option={option}
          handleChange={() => handleChange(questions.id, option.value || "")}
          current={result as string}
        />
      );
    }

    return (
      <button
        key={value}
        className="result-button column align-center justify-start"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          minWidth: "40px",
        }}
        onClick={() => handleChange(questions.id, value)}
        type="button"
      >
        <IconComponent
          size="20px"
          color={
            result === value
              ? "hsl(var(--brand-primary))"
              : "hsl(var(--muted-foreground))"
          }
        />
        <div
          className="caption"
          style={{
            fontSize: "10px",
            textAlign: "center",
            color: result === value ? "hsl(var(--primary))" : "#333",
          }}
        >
          {content}
        </div>
      </button>
    );
  };

  const renderQuestionContent = () => {
    switch (questions.type) {
      case "radio":
        return questions.options.map(({ Icon, value, content }) =>
          Icon === "SupportButton" ? (
            <SupportButton
              key={value}
              option={{ Icon, value, content }}
              handleChange={() => handleChange(questions.id, value)}
              current={result}
            />
          ) : (
            renderIcon({Icon, value, content})
          ),
        );
      case "boolean":
        return (
          <div className="flex items-center justify-between gap-2">
            <label htmlFor={questions.title}>
              {questions.text || questions.content}
            </label>
            <input
              id={questions.title}
              type="checkbox"
              name={questions.title}
              onChange={(e) => handleChange(questions.id, e.target.checked)}
              checked={result}
            />
          </div>
        );
      case "dropdown":
        return (
          <select
            name={questions.title}
            value={result}
            onChange={(e) => handleChange(questions.id, e.currentTarget.value)}
            className="px-2 py-1"
          >
            <option value="">---</option>
            {questions.options.map(({ value, content }) => (
              <option
                key={`question-${questionId}-select-${value}`}
                value={value}
              >
                {content}
              </option>
            ))}
          </select>
        );
      case "multi":
        return questions.options.map(({ value, content }) => {
          const inputId = `${questionId}-select-${value}`;
          return (
            <div
              key={inputId}
              className="flex items-center justify-between gap-2"
            >
              <input
                id={inputId}
                name={inputId}
                type="checkbox"
                onChange={(e) =>
                  handleMultiChange(questions.id, value, e.target.checked)
                }
                checked={result.includes(value)}
              />
              <label htmlFor={inputId} className="ml-2">
                {content}
              </label>
            </div>
          );
        });
      case "textarea":
        return (
          <textarea
            rows={2}
            placeholder="Notes/Key Issues"
            onChange={(e) => handleChange(questions.id, e.target.value)}
            value={result}
            key={`question-${questionId}-notes`}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div>
        <p className="">{questions.type !== 'boolean' && questions.content}</p>
      </div>
        <div className="wrap flex flex-auto gap-2">
          {renderQuestionContent()}
        </div>
    </div>
  );
};

export default Result;
