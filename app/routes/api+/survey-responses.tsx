export { action } from "./survey-responses.action.server";

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  );
}

type SubmittedSurveyAnswer = {
  question_id: string;
  answer_value: string | string[];
};

type SubmittedSurveyResponse = {
  result_id: string;
  contact_id?: number | null;
  completed?: boolean;
  last_page_completed?: string | null;
  answers?: SubmittedSurveyAnswer[];
};

