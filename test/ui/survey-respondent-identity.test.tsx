import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test, vi } from "vitest";
import SurveyPage from "../../app/routes/survey+/$surveyId";

vi.mock("../../app/routes/survey+/$surveyId.loader.server", () => ({ loader: vi.fn() }));

afterEach(() => { vi.unstubAllGlobals(); });

function surveyData(resultId = "respondent-a", token = "signed-a") {
  return {
    resultId, respondentToken: token, contact: null, existingResponse: null, existingAnswers: { Q1: "Saved answer" },
    survey: { id: 1, survey_id: "public-survey", title: "Public survey", survey_page: [{ page_id: "page-1", title: "Questions", survey_question: [{ id: 1, question_id: "Q1", question_text: "Your answer", question_type: "text", is_required: false }] }] },
  };
}

function setup() {
  let data = surveyData();
  const writes: { path: string; fields: Record<string, FormDataEntryValue> }[] = [];
  const action = async ({ request }: { request: Request }) => {
    writes.push({ path: new URL(request.url).pathname, fields: Object.fromEntries(await request.formData()) });
    return { success: true };
  };
  vi.stubGlobal("fetch", vi.fn(async (input: string, init: RequestInit) => {
    if (!(init.body instanceof FormData)) throw new Error("Expected survey form data");
    writes.push({ path: new URL(input, window.location.origin).pathname, fields: Object.fromEntries(init.body) });
    return Response.json({ success: true });
  }));
  const router = createMemoryRouter([
    { path: "/survey/:id", element: <SurveyPage />, loader: () => data },
    { path: "/api/survey-answer", action }, { path: "/api/survey-complete", action },
  ], { initialEntries: ["/survey/public-survey"] });
  render(<RouterProvider router={router} />);
  return { router, writes, setData: (next: ReturnType<typeof surveyData>) => { data = next; } };
}

describe("public survey signed identity", () => {
  test("posts the loader token with both the answer and completion", async () => {
    const { writes } = setup();
    const input = await screen.findByLabelText("Your answer");
    fireEvent.change(input, { target: { value: "Updated answer" } });
    await waitFor(() => expect(writes).toHaveLength(1), { timeout: 3000 });
    expect(writes[0]).toEqual({ path: "/api/survey-answer", fields: { surveyId: "public-survey", questionId: "Q1", answerValue: "Updated answer", pageId: "page-1", contactId: "", resultId: "respondent-a", respondent_token: "signed-a" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => expect(writes).toHaveLength(2));
    expect(writes[1]).toEqual({ path: "/api/survey-complete", fields: { surveyId: "public-survey", resultId: "respondent-a", respondent_token: "signed-a", completed: "true" } });
  });

  test("starts from the new respondent's saved answers after identity changes", async () => {
    const { router, setData } = setup();
    fireEvent.click(await screen.findByRole("button", { name: "Submit" }));
    await screen.findByText("Thank You!");
    setData({ ...surveyData("respondent-b", "signed-b"), existingAnswers: { Q1: "Other respondent" } });
    await act(async () => { router.revalidate(); });
    expect(await screen.findByLabelText("Your answer")).toHaveValue("Other respondent");
    expect(screen.queryByText("Thank You!")).not.toBeInTheDocument();
  });

  test("keeps current input when the same identity revalidates", async () => {
    const { router, writes } = setup();
    fireEvent.change(await screen.findByLabelText("Your answer"), { target: { value: "Current input" } });
    await act(async () => { router.revalidate(); });
    expect(screen.getByLabelText("Your answer")).toHaveValue("Current input");
    // Let the actual pending debounce settle before fixture cleanup.
    await waitFor(() => expect(writes).toHaveLength(1), { timeout: 3000 });
  });
});
