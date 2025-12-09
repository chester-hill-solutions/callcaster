import { useEffect, useState } from "react";
import SupportButton from "./SupportButton";
import { iconMapping, IconType } from "./Result.IconMap";
import { Block, BlockOption } from "@/lib/types";

type BlockOptionWithIcon = BlockOption & {
  Icon?: string;
};

interface ResultProps {
  action: (response: { column: string; value: string | boolean | string[] }) => void;
  initResult: string | boolean | string[] | null;
  questions: Block;
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

  const renderIcon = (option: BlockOptionWithIcon) => {
    const optionValue = option.value || "";
    const optionContent = option.content || "";
    
    if (option.Icon === "SupportButton") {
      return (
        <SupportButton
          key={optionValue}
          option={option}
          handleChange={() => handleChange(questions.id, optionValue)}
          current={result as string}
        />
      );
    }

    const IconComponent = option.Icon ? iconMapping[option.Icon as IconType] : null;
    if (!IconComponent) {
      //console.error(`Icon component ${option.Icon} is not found in iconMapping`);
      return (
        <SupportButton
          key={optionValue}
          option={option}
          handleChange={() => handleChange(questions.id, optionValue)}
          current={result as string}
        />
      );
    }

    return (
      <button
        key={optionValue}
        className="result-button column align-center justify-start"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          minWidth: "40px",
        }}
        onClick={() => handleChange(questions.id, optionValue)}
        type="button"
      >
        <IconComponent
          size="20px"
          color={
            result === optionValue
              ? "hsl(var(--brand-primary))"
              : "hsl(var(--muted-foreground))"
          }
        />
        <div
          className="caption"
          style={{
            fontSize: "10px",
            textAlign: "center",
            color: result === optionValue ? "hsl(var(--primary))" : "#333",
          }}
        >
          {optionContent}
        </div>
      </button>
    );
  };

  const renderQuestionContent = () => {
    switch (questions.type) {
      case "radio":
        return (questions.options as BlockOptionWithIcon[]).map((option) => {
          const optionValue = option.value || "";
          const optionContent = option.content || "";
          const optionIcon = option.Icon;
          
          return optionIcon === "SupportButton" ? (
            <SupportButton
              key={optionValue}
              option={option}
              handleChange={() => handleChange(questions.id, optionValue)}
              current={result}
            />
          ) : (
            renderIcon(option)
          );
        });
      case "boolean":
        return (
          <div className="flex items-center justify-between gap-2">
            <label htmlFor={questions.title}>
              {questions.content}
            </label>
            <input
              disabled={disabled}
              id={questions.title}
              type="checkbox"
              name={questions.title}
              onChange={(e) => handleChange(questions.id, e.target.checked)}
              checked={result as boolean}
            />
          </div>
        );
      case "dropdown":
        return (
          <select
          disabled={disabled}
            name={questions.title}
            value={result as string}
            onChange={(e) => handleChange(questions.id, e.currentTarget.value)}
            className="px-2 py-1"
          >
            <option value="">---</option>
            {(questions.options as BlockOption[]).map((option) => {
              const optionValue = option.value || "";
              const optionContent = option.content || "";
              return (
                <option
                  key={`question-${questionId}-select-${optionValue}`}
                  value={optionValue}
                >
                  {optionContent}
                </option>
              );
            })}
          </select>
        );
      case "multi":
        return (questions.options as BlockOption[]).map((option) => {
          const optionValue = option.value || "";
          const optionContent = option.content || "";
          const inputId = `${questionId}-select-${optionValue}`;
          const resultArray = Array.isArray(result) ? result : [];
          return (
            <div
              key={inputId}
              className="flex min-w-[250px] items-center gap-2"
            >
              <input
              disabled={disabled}
                id={inputId}
                name={inputId}
                type="checkbox"
                onChange={(e) =>
                  handleMultiChange(questions.id, optionValue, e.target.checked)
                }
                checked={resultArray.includes(optionValue)}
              />
              <label htmlFor={inputId} className="ml-2">
                {optionContent}
              </label>
            </div>
          );
        });
      case "textarea":
        return (
          <textarea
            rows={2}
            placeholder=""
            onChange={(e) => handleChange(questions.id, e.target.value)}
            value={result as string}
            disabled={disabled}
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
        <p className="">{questions.type !== "boolean" && questions.content}</p>
      </div>
      <div className="flex max-w-[500px] flex-auto flex-wrap gap-2">
        {renderQuestionContent()}
      </div>
    </div>
  );
};

export default Result;
