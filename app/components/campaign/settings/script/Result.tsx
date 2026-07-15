import { useState } from "react";
import SupportButton from "./SupportButton";
import { iconMapping, IconType } from "./Result.IconMap";
import {
  Block,
  BlockOption,
  IVROption,
} from "@/lib/types";

// Extended types for the Result component
type ScriptBlock = Block & {
  text?: string;
};

// Extend BlockOption so Icon is a discriminant for rendering
type ResultOption = BlockOption & {
  Icon?: string;
};

interface ResultProps {
  action: (response: { column: string; value: string | boolean | string[] }) => void;
  initResult: string | boolean | string[] | null;
  questions: ScriptBlock;
  questionId: string;
  disabled: boolean;
}

/**
 * An option's stored answer value.
 *
 * The documented upload format (docs/script-json-format.md) keys options by
 * `{ content, next }` with no `value`, so a script uploaded exactly as
 * documented would otherwise render `value="undefined"` here. Fall back to the
 * option text, which is what the builder derives `value` from anyway.
 */
const optionValue = (option: BlockOption | IVROption): string =>
  String(option.value ?? (option as BlockOption).content ?? "");

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
  const [prevInitResult, setPrevInitResult] = useState(initResult);
  if (prevInitResult !== initResult) {
    setPrevInitResult(initResult);
    setResult(
      initResult ||
        (questions.type === "multi" || questions.type === "checkbox" ? [] : ""),
    );
  }

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

  const renderIcon = (option: ResultOption) => {
    if (option.Icon === "SupportButton") {
      return (
        <SupportButton
          key={optionValue(option)}
          option={{ value: optionValue(option), content: option.content || "" }}
          handleChange={() => handleChange(questions.id, optionValue(option))}
          current={typeof result === 'string' ? result : ''}
        />
      );
    }

    const iconKey = (option.Icon || "") as IconType;
    const IconComponent = iconMapping[iconKey];
    if (!IconComponent) {
      return (
        <SupportButton
          key={optionValue(option)}
          option={{ value: optionValue(option), content: option.content || "" }}
          handleChange={() => handleChange(questions.id, optionValue(option))}
          current={typeof result === 'string' ? result : ''}
        />
      );
    }

    return (
      <button
        key={option.value}
        className="result-button column align-center justify-start"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          minWidth: "40px",
        }}
        onClick={() => handleChange(questions.id, optionValue(option))}
        type="button"
      >
        <IconComponent
          size="20px"
          color={
            result === option.value
              ? "hsl(var(--brand-primary))"
              : "hsl(var(--muted-foreground))"
          }
        />
        <div
          className="caption"
          style={{
            fontSize: "10px",
            textAlign: "center",
            color: result === option.value ? "hsl(var(--primary))" : "#333",
          }}
        >
          {option.content}
        </div>
      </button>
    );
  };

  const renderQuestionContent = () => {
    switch (questions.type) {
      case "radio":
        return questions.options.map((option: BlockOption | IVROption) => {
          const opt = option as ResultOption;
          return opt.Icon === "SupportButton"
            ? (
                <SupportButton
                  key={optionValue(opt)}
                  option={{ value: optionValue(opt), content: opt.content || "" }}
                  handleChange={() => handleChange(questions.id, optionValue(opt))}
                  current={typeof result === 'string' ? result : ''}
                />
              )
            : renderIcon(opt);
        });
      case "boolean":
        return (
          <div className="flex items-center justify-between gap-2">
            <label htmlFor={questions.title}>
              {questions.text || questions.content}
            </label>
            <input
              disabled={disabled}
              id={questions.title}
              type="checkbox"
              name={questions.title}
              onChange={(e) => handleChange(questions.id, e.target.checked)}
              checked={typeof result === 'boolean' ? result : false}
            />
          </div>
        );
      // "dropdown" is the legacy wire type; "select" is the documented one
      // (docs/script-json-format.md) and what the builder writes for new
      // blocks. Both mean the same thing — render them the same way.
      case "dropdown":
      case "select":
        return (
          <select
          disabled={disabled}
            name={questions.title}
            value={typeof result === 'string' ? result : ''}
            onChange={(e) => handleChange(questions.id, e.currentTarget.value)}
            className="px-2 py-1"
          >
            <option value="">---</option>
            {questions.options.map((option: BlockOption | IVROption) => (
              <option
                key={`question-${questionId}-select-${optionValue(option)}`}
                value={optionValue(option)}
              >
                {option.content}
              </option>
            ))}
          </select>
        );
      // "multi" is the legacy wire type; "checkbox" is the documented one.
      case "multi":
      case "checkbox":
        return questions.options.map((option: BlockOption | IVROption) => {
          const inputId = `${questionId}-select-${optionValue(option)}`;
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
                  handleMultiChange(questions.id, optionValue(option), e.target.checked)
                }
                checked={Array.isArray(result) ? result.includes(optionValue(option)) : false}
              />
              <label htmlFor={inputId} className="ml-2">
                {option.content}
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
