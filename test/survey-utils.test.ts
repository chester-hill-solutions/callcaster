import { describe, expect, test } from "vitest";
import {
  SurveyUtils,
  SurveyValidationRules,
  SurveyValidator,
  type SurveyQuestionData,
} from "@/lib/survey-utils";

describe("survey-utils", () => {
  test("parseSurveyData returns null for non-object", () => {
    expect(SurveyUtils.parseSurveyData(null)).toBeNull();
    expect(SurveyUtils.parseSurveyData("nope")).toBeNull();
    expect(SurveyUtils.parseSurveyData([])).toBeNull();
  });

  test("parseSurveyData parses nested pages/questions/options defensively", () => {
    const parsed = SurveyUtils.parseSurveyData({
      survey_id: "s1",
      title: "My Survey",
      is_active: true,
      survey_page: [
        {
          page_id: "p1",
          title: "Page 1",
          page_order: "2",
          survey_question: [
            {
              question_id: "q1",
              question_text: "Email",
              question_type: "text",
              is_required: "true",
              question_order: 1,
              question_option: [
                {
                  option_value: "a",
                  option_label: "A",
                  option_order: "3",
                },
                "bad",
              ],
            },
            "bad-question",
          ],
        },
        "bad-page",
      ],
    });

    expect(parsed).toEqual({
      survey_id: "s1",
      title: "My Survey",
      is_active: true,
      survey_page: [
        {
          page_id: "p1",
          title: "Page 1",
          page_order: 2,
          survey_question: [
            {
              question_id: "q1",
              question_text: "Email",
              question_type: "text",
              is_required: true,
              question_order: 1,
              question_option: [
                { option_value: "a", option_label: "A", option_order: 3 },
              ],
            },
          ],
        },
      ],
    });
  });

  test("parseSurveyPages/questions/options return empty arrays for non-arrays", () => {
    expect(SurveyUtils.parseSurveyPages(null)).toEqual([]);
    expect(SurveyUtils.parseSurveyQuestions({})).toEqual([]);
    expect(SurveyUtils.parseQuestionOptions("x")).toEqual([]);
    expect(SurveyUtils.parseSurveyAnswers(123)).toEqual([]);
  });

  test("parseSurveyResponseData parses contact_id with truthy guard", () => {
    expect(SurveyUtils.parseSurveyResponseData(null)).toBeNull();

    const withContact = SurveyUtils.parseSurveyResponseData({
      result_id: "r1",
      survey_id: "s1",
      contact_id: "42",
      response_answer: [{ question_id: "q1", answer_value: "yes" }],
    });
    expect(withContact).toEqual({
      result_id: "r1",
      survey_id: "s1",
      contact_id: 42,
      response_answer: [{ question_id: "q1", answer_value: "yes" }],
    });

    const zeroContact = SurveyUtils.parseSurveyResponseData({
      result_id: "r2",
      survey_id: "s1",
      contact_id: 0, // falsy => branch to undefined
      response_answer: [],
    });
    expect(zeroContact).toEqual({
      result_id: "r2",
      survey_id: "s1",
      contact_id: undefined,
      response_answer: [],
    });
  });

  test("parseSurveyAnswers filters non-object answers", () => {
    expect(
      SurveyUtils.parseSurveyAnswers([
        { question_id: "q1", answer_value: "a" },
        "bad",
      ]),
    ).toEqual([{ question_id: "q1", answer_value: "a" }]);
  });

  test("answersToMap and mapToAnswers round-trip and filter empty answers", () => {
    expect(
      SurveyUtils.answersToMap([
        { question_id: "q1", answer_value: "a" },
        { question_id: "q2", answer_value: "" },
      ]),
    ).toEqual({ q1: "a", q2: "" });

    expect(
      SurveyUtils.mapToAnswers({
        q1: "a",
        q2: "",
        q3: 123,
      }),
    ).toEqual([
      { question_id: "q1", answer_value: "a" },
      { question_id: "q3", answer_value: "123" },
    ]);
  });

  test("isValidQuestionType and getQuestionType", () => {
    expect(SurveyUtils.isValidQuestionType("text")).toBe(true);
    expect(SurveyUtils.isValidQuestionType("nope")).toBe(false);
    expect(SurveyUtils.getQuestionType("checkbox")).toBe("checkbox");
    expect(SurveyUtils.getQuestionType("unknown")).toBe("text");
  });

  test("getCurrentPage, getTotalPages, calculateProgress", () => {
    const survey = SurveyUtils.parseSurveyData({
      survey_id: "s1",
      title: "t",
      is_active: true,
      survey_page: [{ page_id: "p1", title: "t1", page_order: 1 }],
    })!;
    expect(SurveyUtils.getCurrentPage(survey, -1)).toBeNull();
    expect(SurveyUtils.getCurrentPage(survey, 2)).toBeNull();
    expect(
      SurveyUtils.getCurrentPage({ ...survey, survey_page: undefined }, 0),
    ).toBeNull();
    const sparseSurvey = { ...survey, survey_page: [] as any[] } as any;
    sparseSurvey.survey_page[0] = undefined;
    expect(SurveyUtils.getCurrentPage(sparseSurvey, 0)).toBeNull();
    expect(SurveyUtils.getCurrentPage(survey, 0)?.page_id).toBe("p1");
    expect(SurveyUtils.getTotalPages(survey)).toBe(1);
    expect(
      SurveyUtils.getTotalPages({ ...survey, survey_page: undefined }),
    ).toBe(0);
    expect(SurveyUtils.calculateProgress(0, 0)).toBe(0);
    expect(SurveyUtils.calculateProgress(0, 4)).toBe(25);
  });

  test("validateSurveyData requires non-empty id/title and is_active true", () => {
    expect(SurveyUtils.validateSurveyData({})).toBe(false);
    expect(
      SurveyUtils.validateSurveyData({
        survey_id: "s",
        title: "t",
        is_active: false,
      }),
    ).toBe(false);
    expect(
      SurveyUtils.validateSurveyData({
        survey_id: "s",
        title: "t",
        is_active: true,
      }),
    ).toBe(true);
  });

  test("createSurveyFormData appends strings and JSON for arrays", () => {
    const fd = SurveyUtils.createSurveyFormData({
      a: "x",
      b: 123,
      c: ["y", 1],
      d: null,
      e: undefined,
    });
    const entries = Object.fromEntries(fd.entries());
    expect(entries.a).toBe("x");
    expect(entries.b).toBe("123");
    expect(entries.c).toBe(JSON.stringify(["y", 1]));
    expect(entries.d).toBeUndefined();
    expect(entries.e).toBeUndefined();
  });

  test("SurveyValidationRules required/email/phone/minLength/maxLength", () => {
    expect(SurveyValidationRules.required(["x"])).toBe(true);
    expect(SurveyValidationRules.required([])).toBe(false);
    expect(SurveyValidationRules.required("  ")).toBe(false);
    expect(SurveyValidationRules.required("a")).toBe(true);

    expect(SurveyValidationRules.email("a@b.com")).toBe(true);
    expect(SurveyValidationRules.email("bad")).toBe(false);

    expect(SurveyValidationRules.phone("+15555550100")).toBe(true);
    expect(SurveyValidationRules.phone("(555) 555-0100")).toBe(true);
    expect(SurveyValidationRules.phone("nope")).toBe(false);

    expect(SurveyValidationRules.minLength(3)("abc")).toBe(true);
    expect(SurveyValidationRules.minLength(3)("ab")).toBe(false);
    expect(SurveyValidationRules.maxLength(2)("ab")).toBe(true);
    expect(SurveyValidationRules.maxLength(2)("abc")).toBe(false);
  });

  test("SurveyValidator.validateQuestion covers text/radio/checkbox/default branches", () => {
    const requiredText: SurveyQuestionData = {
      question_id: "q1",
      question_text: "Name",
      question_type: "text",
      is_required: true,
      question_order: 1,
    };

    expect(SurveyValidator.validateQuestion(requiredText, "")).toMatchObject({
      isValid: false,
      errors: [{ code: "REQUIRED" }],
    });

    expect(SurveyValidator.validateQuestion(requiredText, "ok")).toEqual({
      isValid: true,
      errors: [],
    });

    // text + required(value) true but minLength false (array => required true, safeString => "")
    expect(SurveyValidator.validateQuestion(requiredText, ["x"])).toMatchObject(
      {
        isValid: false,
        errors: [{ code: "MIN_LENGTH" }],
      },
    );

    const radio: SurveyQuestionData = {
      ...requiredText,
      question_type: "radio",
    };
    const radioRes = SurveyValidator.validateQuestion(radio, "");
    expect(radioRes.isValid).toBe(false);
    expect(radioRes.errors.map((e) => e.code)).toEqual([
      "REQUIRED",
      "REQUIRED",
    ]);

    const checkbox: SurveyQuestionData = {
      ...requiredText,
      question_type: "checkbox",
    };
    const checkboxRes = SurveyValidator.validateQuestion(checkbox, []);
    expect(checkboxRes.isValid).toBe(false);
    expect(checkboxRes.errors.map((e) => e.code)).toEqual([
      "REQUIRED",
      "REQUIRED",
    ]);

    const optionalRadio: SurveyQuestionData = { ...radio, is_required: false };
    expect(SurveyValidator.validateQuestion(optionalRadio, "")).toEqual({
      isValid: true,
      errors: [],
    });

    const unknown: SurveyQuestionData = {
      ...requiredText,
      question_type: "textarea", // valid but not handled in switch => no extra errors
    };
    expect(SurveyValidator.validateQuestion(unknown, "ok")).toEqual({
      isValid: true,
      errors: [],
    });
  });
});
