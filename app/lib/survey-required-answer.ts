import { surveyOptionForAnswer } from "./survey-answer-state";

type Question = {
  question_type: string;
  question_option?: { option_value: string; option_label: string }[];
};

/** Shared presence rule for browser values and their saved wire representation. */
export function hasRequiredSurveyAnswer(
  question: Question,
  value: unknown,
): boolean {
  if (
    question.question_type === "text" ||
    question.question_type === "textarea"
  ) {
    return typeof value === "string" && value.trim().length > 0;
  }
  const selected = (answer: unknown) => {
    if (typeof answer !== "string" || answer.trim().length === 0) return false;
    return Boolean(
      surveyOptionForAnswer(
        answer,
        question.question_option ?? [],
      )?.option_value.trim(),
    );
  };
  if (question.question_type === "radio") return selected(value);
  if (question.question_type !== "checkbox") return false;
  let values: unknown = value;
  if (typeof values === "string") {
    try {
      values = JSON.parse(values);
    } catch {
      return false;
    }
  }
  return Array.isArray(values) && values.length > 0 && values.every(selected);
}
