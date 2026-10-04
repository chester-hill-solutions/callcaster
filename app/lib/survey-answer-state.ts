export type SurveyAnswerValue = string | string[];
type Option = { option_value: string; option_label: string };
type Question = { question_id: string; question_type: string; question_option?: Option[] };
type Page = { page_id: string; survey_question?: Question[] };

export function surveyAnswerKey(pageId: string, questionId: string) {
  return JSON.stringify([pageId, questionId]);
}

function isWriteIn(option: Option) {
  return option.option_label.toLowerCase().includes("(write in)");
}

export function hydrateSurveyAnswers(pages: Page[], existing: Record<string, SurveyAnswerValue>) {
  const answers: Record<string, SurveyAnswerValue> = {};
  const writeIns: Record<string, string> = {};
  for (const page of pages) {
    for (const question of page.survey_question ?? []) {
      const key = surveyAnswerKey(page.page_id, question.question_id);
      const saved = existing[key];
      if (saved === undefined) continue;
      const options = question.question_option ?? [];
      const writeInOptions = options.filter(isWriteIn).sort((a, b) => b.option_value.length - a.option_value.length);
      const decode = (value: string) => {
        if (options.some(option => option.option_value === value)) return value;
        const option = writeInOptions.find(candidate => value.startsWith(`${candidate.option_value}: `));
        if (!option) return value;
        writeIns[key] = value.slice(option.option_value.length + 2);
        return option.option_value;
      };
      answers[key] = question.question_type === "radio" || question.question_type === "checkbox"
        ? Array.isArray(saved) ? saved.map(decode) : decode(saved)
        : saved;
    }
  }
  return { answers, writeIns };
}

export function withSurveyWriteIn(value: SurveyAnswerValue, writeIn: string, options: Option[]) {
  const encode = (selected: string) => writeIn && options.some(option => option.option_value === selected && isWriteIn(option))
    ? `${selected}: ${writeIn}`
    : selected;
  return Array.isArray(value) ? value.map(encode) : encode(value);
}
