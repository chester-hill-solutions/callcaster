import { act, renderHook } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { useSurveyForm } from "../../app/hooks/surveys/useSurveyForm";
import type { SurveyFormData } from "../../app/lib/types";

// The create/edit survey routes were collapsed onto one hook. These
// tests pin the nested index scoping — the part a refactor can silently
// invert (e.g. `pIndex === pageIndex` becoming `!==`), which the route-level
// redirect test does not touch.

function buildSurvey(): SurveyFormData {
  return {
    survey_id: "s-1",
    title: "Survey",
    is_active: false,
    pages: [
      { page_id: "page-1", title: "Page 1", page_order: 1, questions: [] },
      { page_id: "page-2", title: "Page 2", page_order: 2, questions: [] },
    ],
  };
}

function withRadioQuestion(survey: SurveyFormData): SurveyFormData {
  survey.pages[0].questions = [
    {
      question_id: "question-1",
      question_text: "Pick one",
      question_type: "radio",
      is_required: false,
      question_order: 1,
      options: [
        { option_value: "a", option_label: "A", option_order: 1 },
        { option_value: "b", option_label: "B", option_order: 2 },
      ],
    },
  ];
  return survey;
}

describe("useSurveyForm", () => {
  test("addQuestion appends to the target page only, with the next order", () => {
    const { result } = renderHook(() => useSurveyForm(buildSurvey()));

    act(() => {
      result.current.addQuestion(1);
    });

    expect(result.current.formData.pages[0].questions).toHaveLength(0);
    const [question] = result.current.formData.pages[1].questions;
    expect(question.question_id).toBe("question-1");
    expect(question.question_order).toBe(1);
    expect(question.question_type).toBe("text");
  });

  test("addOption appends to the target question only, with the next order", () => {
    const { result } = renderHook(() =>
      useSurveyForm(withRadioQuestion(buildSurvey())),
    );

    act(() => {
      result.current.addOption(0, 0);
    });

    const options = result.current.formData.pages[0].questions[0].options;
    expect(options).toHaveLength(3);
    expect(options?.[2].option_order).toBe(3);
    expect(result.current.formData.pages[1].questions).toHaveLength(0);
  });

  test("updateOptionField changes only the target option", () => {
    const { result } = renderHook(() =>
      useSurveyForm(withRadioQuestion(buildSurvey())),
    );

    act(() => {
      result.current.updateOptionField(0, 0, 1, "option_label", "Bee");
    });

    const options = result.current.formData.pages[0].questions[0].options;
    expect(options?.[0].option_label).toBe("A");
    expect(options?.[1].option_label).toBe("Bee");
  });

  test("removeOption removes only the target option", () => {
    const { result } = renderHook(() =>
      useSurveyForm(withRadioQuestion(buildSurvey())),
    );

    act(() => {
      result.current.removeOption(0, 0, 0);
    });

    const options = result.current.formData.pages[0].questions[0].options;
    expect(options).toHaveLength(1);
    expect(options?.[0].option_label).toBe("B");
  });

  test("removePage keeps the last remaining page", () => {
    const { result } = renderHook(() => useSurveyForm(buildSurvey()));

    act(() => {
      result.current.removePage(0);
    });
    act(() => {
      result.current.removePage(0);
    });

    expect(result.current.formData.pages).toHaveLength(1);
  });

  test("ids stay unique after a question is removed", () => {
    const { result } = renderHook(() => useSurveyForm(buildSurvey()));

    act(() => {
      result.current.addQuestion(0);
    });
    act(() => {
      result.current.addQuestion(0);
    });
    act(() => {
      result.current.removeQuestion(0, 0);
    });
    act(() => {
      result.current.addQuestion(0);
    });

    const ids = result.current.formData.pages[0].questions.map(
      (question) => question.question_id,
    );
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain("question-1");
  });
});
