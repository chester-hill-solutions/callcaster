import { useState } from "react";

import type {
  QuestionOptionFormData,
  SurveyFormData,
  SurveyPageFormData,
  SurveyQuestionFormData,
  SurveyQuestionType,
} from "@/lib/types";

/**
 * The next free numeric suffix for an id like `page-2` / `question-1`.
 * Derived from the highest existing suffix, so ids stay unique after a
 * removal (using the array length would re-issue a live id).
 */
function nextSuffix(existing: string[]): number {
  const highest = existing.reduce((max, id) => {
    const match = /-(\d+)$/.exec(id);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return highest + 1;
}

/**
 * Owns the survey builder's form state. The create and edit survey
 * routes had two near-identical copies of this logic; it lives here once.
 *
 * All nested mutations go through a small set of index primitives
 * (`updatePages` / `withPage` / `withQuestions` / `withQuestion` /
 * `withOptions` / `withOption`), so the tree traversal is written once.
 */
export function useSurveyForm(initialFormData: SurveyFormData) {
  const [formData, setFormData] = useState<SurveyFormData>(initialFormData);

  const updatePages = (
    fn: (pages: SurveyPageFormData[]) => SurveyPageFormData[],
  ) => setFormData((prev) => ({ ...prev, pages: fn(prev.pages) }));

  const withPage = (
    pageIndex: number,
    fn: (page: SurveyPageFormData) => SurveyPageFormData,
  ) =>
    updatePages((pages) =>
      pages.map((page, index) => (index === pageIndex ? fn(page) : page)),
    );

  const withQuestions = (
    pageIndex: number,
    fn: (questions: SurveyQuestionFormData[]) => SurveyQuestionFormData[],
  ) =>
    withPage(pageIndex, (page) => ({ ...page, questions: fn(page.questions) }));

  const withQuestion = (
    pageIndex: number,
    questionIndex: number,
    fn: (question: SurveyQuestionFormData) => SurveyQuestionFormData,
  ) =>
    withQuestions(pageIndex, (questions) =>
      questions.map((question, index) =>
        index === questionIndex ? fn(question) : question,
      ),
    );

  const withOptions = (
    pageIndex: number,
    questionIndex: number,
    fn: (options: QuestionOptionFormData[]) => QuestionOptionFormData[],
  ) =>
    withQuestion(pageIndex, questionIndex, (question) => ({
      ...question,
      options: fn(question.options ?? []),
    }));

  const withOption = (
    pageIndex: number,
    questionIndex: number,
    optionIndex: number,
    fn: (option: QuestionOptionFormData) => QuestionOptionFormData,
  ) =>
    withOptions(pageIndex, questionIndex, (options) =>
      options.map((option, index) => (index === optionIndex ? fn(option) : option)),
    );

  const addPage = () =>
    updatePages((pages) => {
      const suffix = nextSuffix(pages.map((page) => page.page_id));
      return [
        ...pages,
        {
          page_id: `page-${suffix}`,
          title: `Page ${suffix}`,
          page_order: pages.length + 1,
          questions: [],
        },
      ];
    });

  const removePage = (pageIndex: number) =>
    updatePages((pages) =>
      pages.length <= 1
        ? pages
        : pages.filter((_, index) => index !== pageIndex),
    );

  const addQuestion = (pageIndex: number) =>
    withQuestions(pageIndex, (questions) => {
      const suffix = nextSuffix(questions.map((question) => question.question_id));
      return [
        ...questions,
        {
          question_id: `question-${suffix}`,
          question_text: "",
          question_type: "text" as SurveyQuestionType,
          is_required: false,
          question_order: questions.length + 1,
          options: [],
        },
      ];
    });

  const removeQuestion = (pageIndex: number, questionIndex: number) =>
    withQuestions(pageIndex, (questions) =>
      questions.filter((_, index) => index !== questionIndex),
    );

  const addOption = (pageIndex: number, questionIndex: number) =>
    withOptions(pageIndex, questionIndex, (options) => [
      ...options,
      {
        option_value: "",
        option_label: "",
        option_order: options.length + 1,
      },
    ]);

  const removeOption = (
    pageIndex: number,
    questionIndex: number,
    optionIndex: number,
  ) =>
    withOptions(pageIndex, questionIndex, (options) =>
      options.filter((_, index) => index !== optionIndex),
    );

  const updateField = <K extends keyof SurveyFormData>(
    field: K,
    value: SurveyFormData[K],
  ) => setFormData((prev) => ({ ...prev, [field]: value }));

  const updatePageField = <K extends keyof SurveyPageFormData>(
    pageIndex: number,
    field: K,
    value: SurveyPageFormData[K],
  ) => withPage(pageIndex, (page) => ({ ...page, [field]: value }));

  const updateQuestionField = <K extends keyof SurveyQuestionFormData>(
    pageIndex: number,
    questionIndex: number,
    field: K,
    value: SurveyQuestionFormData[K],
  ) =>
    withQuestion(pageIndex, questionIndex, (question) => ({
      ...question,
      [field]: value,
    }));

  const updateOptionField = <K extends keyof QuestionOptionFormData>(
    pageIndex: number,
    questionIndex: number,
    optionIndex: number,
    field: K,
    value: QuestionOptionFormData[K],
  ) =>
    withOption(pageIndex, questionIndex, optionIndex, (option) => ({
      ...option,
      [field]: value,
    }));

  return {
    formData,
    addPage,
    removePage,
    addQuestion,
    removeQuestion,
    addOption,
    removeOption,
    updateField,
    updatePageField,
    updateQuestionField,
    updateOptionField,
  };
}
