import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test, vi } from "vitest";
import SurveyPage from "../../app/routes/survey+/$surveyId";

vi.mock("../../app/routes/survey+/$surveyId.loader.server", () => ({ loader: vi.fn() }));
afterEach(() => { vi.unstubAllGlobals(); });

type Question = {
  id: number; question_id: string; question_text: string; question_type: string;
  is_required: boolean;
  question_option?: { id: number; option_value: string; option_label: string; option_order: number }[];
};
function setup({
  type = "text", saved = {}, collision = false,
}: { type?: string; saved?: Record<string, string | string[]>; collision?: boolean } = {}) {
  const pages = [1, 2].map(i => ({
    page_id: `page-${i}`, title: `Page ${i}`, survey_question: [{
      id: i, question_id: "question-1", question_text: `Answer on page ${i}`,
      question_type: type, is_required: false,
      question_option: [
        { id: i * 10, option_value: "yes", option_label: "Yes", option_order: 1 },
        { id: i * 10 + 1, option_value: "other", option_label: "Other (write in)", option_order: 2 },
      ],
    } as Question],
  }));
  if (collision) pages[0].survey_question.push({ id: 30, question_id: "question-1_writein", question_text: "Separate answer", question_type: "text", is_required: false });
  const writes: Record<string, FormDataEntryValue>[] = [];
  vi.stubGlobal("fetch", vi.fn(async (_input: string, init: RequestInit) => {
    if (!(init.body instanceof FormData)) throw new Error("Expected form data");
    writes.push(Object.fromEntries(init.body));
    return Response.json({ success: true });
  }));
  const router = createMemoryRouter([{ path: "/survey/:id", element: <SurveyPage />, loader: () => ({
    resultId: "respondent", respondentToken: "signed-respondent", contact: null,
    existingResponse: null, existingAnswers: saved,
    survey: { id: 1, survey_id: "public-survey", title: "Page scope", survey_page: pages },
  }) }], { initialEntries: ["/survey/public-survey"] });
  render(<RouterProvider router={router} />);
  return { writes };
}
async function next() {
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  await screen.findByText("Page 2 of 2");
}
function previous() { fireEvent.click(screen.getByRole("button", { name: "Previous" })); }

describe("public answers retain page scope (#2294)", () => {
  test("an unanswered repeated label is empty and both edits survive navigation", async () => {
    const { writes } = setup();
    fireEvent.change(await screen.findByLabelText("Answer on page 1"), { target: { value: "First page" } });
    await next();
    expect(screen.getByLabelText("Answer on page 2")).toHaveValue("");
    fireEvent.change(screen.getByLabelText("Answer on page 2"), { target: { value: "Second page" } });
    previous();
    expect(screen.getByLabelText("Answer on page 1")).toHaveValue("First page");
    await next();
    expect(screen.getByLabelText("Answer on page 2")).toHaveValue("Second page");
    expect(writes.map(x => [x.pageId, x.questionId, x.answerValue])).toEqual([
      ["page-1", "question-1", "First page"], ["page-2", "question-1", "Second page"],
    ]);
  });

  test("reload displays each stored value on its own page", async () => {
    setup({ saved: { '["page-1","question-1"]': "First saved", '["page-2","question-1"]': "Second saved" } });
    expect(await screen.findByLabelText("Answer on page 1")).toHaveValue("First saved");
    await next();
    expect(screen.getByLabelText("Answer on page 2")).toHaveValue("Second saved");
    previous();
    expect(screen.getByLabelText("Answer on page 1")).toHaveValue("First saved");
  });

  test("write-in drafts do not appear on another page or replace a real question", async () => {
    const { writes } = setup({ type: "radio", collision: true });
    await screen.findByText("Page 1 of 2");
    fireEvent.click(screen.getByRole("radio", { name: "Other", exact: true }));
    fireEvent.change(screen.getByPlaceholderText("Please specify..."), { target: { value: "First detail" } });
    expect(screen.getByLabelText("Separate answer")).toHaveValue("");
    fireEvent.change(screen.getByLabelText("Separate answer"), { target: { value: "Separate text" } });
    await next();
    expect(screen.getByRole("radio", { name: "Other", exact: true })).not.toBeChecked();
    expect(screen.queryByPlaceholderText("Please specify...")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Other", exact: true }));
    fireEvent.change(screen.getByPlaceholderText("Please specify..."), { target: { value: "Second detail" } });
    previous();
    expect(screen.getByPlaceholderText("Please specify...")).toHaveValue("First detail");
    expect(screen.getByLabelText("Separate answer")).toHaveValue("Separate text");
    await next();
    expect(screen.getByPlaceholderText("Please specify...")).toHaveValue("Second detail");
    expect(writes.map(x => [x.pageId, x.questionId, x.answerValue])).toEqual([
      ["page-1", "question-1", "other: First detail"],
      ["page-1", "question-1_writein", "Separate text"],
      ["page-2", "question-1", "other: Second detail"],
    ]);
  });

  test.each(["radio", "checkbox"])("reload restores %s selection and its write-in text on both pages", async type => {
    const value = (detail: string) => type === "checkbox" ? ["yes", `other: ${detail}`] : `other: ${detail}`;
    setup({ type, saved: { '["page-1","question-1"]': value("First saved detail"), '["page-2","question-1"]': value("Second saved detail") } });
    await screen.findByText("Page 1 of 2");
    expect(screen.getByRole(type, { name: "Other", exact: true })).toBeChecked();
    expect(screen.getByPlaceholderText("Please specify...")).toHaveValue("First saved detail");
    await next();
    expect(screen.getByRole(type, { name: "Other", exact: true })).toBeChecked();
    expect(screen.getByPlaceholderText("Please specify...")).toHaveValue("Second saved detail");
    if (type === "checkbox") expect(screen.getByRole("checkbox", { name: "Yes", exact: true })).toBeChecked();
    previous();
    expect(screen.getByPlaceholderText("Please specify...")).toHaveValue("First saved detail");
  });

  test("checkbox edits keep resumed write-in text in the saved answer", async () => {
    const { writes } = setup({ type: "checkbox", saved: { '["page-1","question-1"]': ["other: Retained detail"] } });
    await screen.findByText("Page 1 of 2");
    await userEvent.setup().click(screen.getByRole("checkbox", { name: "Yes", exact: true }));
    await next();
    expect(writes[0]).toMatchObject({ pageId: "page-1", questionId: "question-1", answerValue: '["other: Retained detail","yes"]', respondent_token: "signed-respondent" });
  });

  test("free text with a colon stays literal and is not a write-in answer", async () => {
    setup({ saved: { '["page-1","question-1"]': "other: literal text" } });
    expect(await screen.findByLabelText("Answer on page 1")).toHaveValue("other: literal text");
    expect(screen.queryByPlaceholderText("Please specify...")).not.toBeInTheDocument();
    await next();
    expect(screen.getByLabelText("Answer on page 2")).toHaveValue("");
  });
});
