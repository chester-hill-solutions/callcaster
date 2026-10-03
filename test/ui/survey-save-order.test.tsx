import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test, vi } from "vitest";
import SurveyPage from "../../app/routes/survey+/$surveyId";

vi.mock("../../app/routes/survey+/$surveyId.loader.server", () => ({ loader: vi.fn() }));
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

type Write = { path: string; fields: Record<string, FormDataEntryValue>; signal?: AbortSignal };
type Reply = { status: number; body: { success?: boolean; error?: string } };
function deferred<T>() { let resolve: (value: T) => void = () => {}; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
function pageData(resultId = "respondent-a", pageCount = 1) {
  return { resultId, respondentToken: `signed-${resultId}`, contact: null, existingResponse: null, existingAnswers: {},
    survey: { id: 1, survey_id: "public-survey", title: "Public survey", survey_page: Array.from({ length: pageCount }, (_, i) => ({ page_id: `page-${i + 1}`, title: `Page ${i + 1}`, survey_question: [
      { id: i * 2 + 1, question_id: `Q${i * 2 + 1}`, question_text: `Answer ${i * 2 + 1}`, question_type: "text", is_required: false },
      { id: i * 2 + 2, question_id: `Q${i * 2 + 2}`, question_text: `Answer ${i * 2 + 2}`, question_type: "textarea", is_required: false },
    ] })) } };
}
function setup(reply: (write: Write) => Promise<Reply> = async () => ({ status: 200, body: { success: true } }), pageCount = 1, configure: (data: ReturnType<typeof pageData>) => void = () => {}) {
  let data = pageData("respondent-a", pageCount);
  configure(data);
  const writes: Write[] = [];
  const perform = async (write: Write) => { writes.push(write); return reply(write); };
  // The same acknowledged transport contract supports both the original router
  // action and the domain form client, so baseline failures prove behavior.
  const action = async ({ request }: { request: Request }) => {
    const response = await perform({ path: new URL(request.url).pathname, fields: Object.fromEntries(await request.formData()), signal: request.signal });
    return Response.json(response.body, { status: response.status });
  };
  vi.stubGlobal("fetch", vi.fn(async (input: string, init: RequestInit) => {
    const form = init.body;
    if (!(form instanceof FormData)) throw new Error("Expected a public survey form body");
    const response = await perform({ path: new URL(input, window.location.origin).pathname, fields: Object.fromEntries(form), signal: init.signal ?? undefined });
    return Response.json(response.body, { status: response.status });
  }));
  const router = createMemoryRouter([
    { path: "/survey/:id", element: <SurveyPage />, loader: () => data },
    { path: "/api/survey-answer", action }, { path: "/api/survey-complete", action },
    { path: "/away", element: <div>Other page</div> },
  ], { initialEntries: ["/survey/public-survey"] });
  const view = render(<RouterProvider router={router} />);
  return { ...view, router, writes, changeIdentity: () => { data = pageData("respondent-b", pageCount); router.revalidate(); } };
}

describe("public survey save acknowledgements (#2108)", () => {
  test("an immediate final submit saves two pending questions before completion", async () => {
    const { writes } = setup();
    fireEvent.change(await screen.findByLabelText("Answer 1"), { target: { value: "First answer" } });
    fireEvent.change(screen.getByLabelText("Answer 2"), { target: { value: "Second answer" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    await screen.findByText("Thank You!");
    expect(writes.map(write => [write.path, write.fields.questionId, write.fields.answerValue])).toEqual([
      ["/api/survey-answer", "Q1", "First answer"], ["/api/survey-answer", "Q2", "Second answer"], ["/api/survey-complete", undefined, undefined],
    ]);
    for (const write of writes) expect(write.fields).toMatchObject({ resultId: "respondent-a", respondent_token: "signed-respondent-a", surveyId: "public-survey" });
  });

  test("completion and success wait for both the answer and completion acknowledgements", async () => {
    const saved = deferred<Reply>(); const completed = deferred<Reply>();
    const { writes } = setup(write => write.path === "/api/survey-answer" ? saved.promise : completed.promise);
    fireEvent.change(await screen.findByLabelText("Answer 1"), { target: { value: "Last answer" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0].path).toBe("/api/survey-answer");
    expect(screen.queryByText("Thank You!")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit" })).toBeDisabled();
    await act(async () => { saved.resolve({ status: 200, body: { success: true } }); });
    await waitFor(() => expect(writes).toHaveLength(2));
    expect(screen.queryByText("Thank You!")).not.toBeInTheDocument();
    await act(async () => { completed.resolve({ status: 200, body: { success: true } }); });
    await screen.findByText("Thank You!");
  });

  test.each([{ status: 500, success: undefined }, { status: 200, success: false }])("a failed answer ($status/$success) keeps the form and can retry", async ({ status, success }) => {
    let reject = true;
    const { writes } = setup(async write => reject && write.path === "/api/survey-answer" ? { status, body: { success, error: "Answer was not saved" } } : { status: 200, body: { success: true } });
    fireEvent.change(await screen.findByLabelText("Answer 1"), { target: { value: "Retained answer" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Answer was not saved");
    expect(screen.queryByText("Thank You!")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Answer 1")).toHaveValue("Retained answer");
    expect(writes.every(write => write.path === "/api/survey-answer")).toBe(true);
    reject = false;
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    await screen.findByText("Thank You!");
    expect(writes.map(write => write.path)).toEqual(["/api/survey-answer", "/api/survey-answer", "/api/survey-complete"]);
  });

  test("a failed completion keeps acknowledged answers and retries only completion", async () => {
    let reject = true;
    const { writes } = setup(async write => reject && write.path === "/api/survey-complete" ? { status: 404, body: { error: "Survey response not found" } } : { status: 200, body: { success: true } });
    fireEvent.change(await screen.findByLabelText("Answer 1"), { target: { value: "Saved answer" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Survey response not found");
    expect(screen.queryByText("Thank You!")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Answer 1")).toHaveValue("Saved answer");
    reject = false;
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    await screen.findByText("Thank You!");
    expect(writes.map(write => write.path)).toEqual(["/api/survey-answer", "/api/survey-complete", "/api/survey-complete"]);
  });

  test("Next waits for a saved answer and retains its original page ID", async () => {
    const saved = deferred<Reply>();
    const { writes } = setup(write => write.path === "/api/survey-answer" ? saved.promise : Promise.resolve({ status: 200, body: { success: true } }), 2);
    fireEvent.change(await screen.findByLabelText("Answer 1"), { target: { value: "Page one" } });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();
    expect(writes[0].fields).toMatchObject({ questionId: "Q1", pageId: "page-1" });
    await act(async () => { saved.resolve({ status: 200, body: { success: true } }); });
    await screen.findByText("Page 2 of 2");
  });

  test("repeated labels retain both pages' pending edits after Previous", async () => {
    const { writes } = setup(undefined, 2, data => {
      for (const page of data.survey.survey_page) page.survey_question[0].question_id = "question-1";
    });
    await screen.findByLabelText("Answer 1");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.change(await screen.findByLabelText("Answer 3"), { target: { value: "Second page edit" } });
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    fireEvent.change(screen.getByLabelText("Answer 1"), { target: { value: "First page edit" } });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("Page 2 of 2");
    expect(writes.map(write => [write.fields.pageId, write.fields.questionId, write.fields.answerValue])).toEqual([
      ["page-2", "question-1", "Second page edit"], ["page-1", "question-1", "First page edit"],
    ]);
  });

  test("a page does not inherit another page's save status for the same label", async () => {
    setup(undefined, 2, data => {
      for (const page of data.survey.survey_page) page.survey_question[0].question_id = "question-1";
    });
    fireEvent.change(await screen.findByLabelText("Answer 1"), { target: { value: "First page" } });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("Page 2 of 2");
    expect(screen.queryByText("Saved")).not.toBeInTheDocument();
  });

  test("checkbox pointer edits are locked while answers await acknowledgement", async () => {
    const held = deferred<Reply>();
    const { writes } = setup(() => held.promise, 1, data => {
      const question = data.survey.survey_page[0].survey_question[0];
      Object.assign(question, { question_type: "checkbox", question_option: [{ id: 1, option_value: "yes", option_label: "Yes", option_order: 1 }] });
    });
    const user = userEvent.setup();
    const checkbox = await screen.findByRole("checkbox");
    await user.click(checkbox);
    expect(checkbox).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => expect(writes).toHaveLength(1));
    const pressSurface = checkbox.closest("label");
    if (!pressSurface) throw new Error("Expected the real React Aria Checkbox label");
    await user.click(pressSurface);
    expect(checkbox).toHaveAttribute("disabled");
    expect(checkbox).toBeDisabled();
    expect(checkbox).toBeChecked();
    expect(writes[0].fields.answerValue).toBe('["yes"]');
    await act(async () => { held.resolve({ status: 200, body: { success: true } }); });
    await screen.findByText("Thank You!");
    expect(writes.map(write => write.path)).toEqual(["/api/survey-answer", "/api/survey-complete"]);
  });

  test("a network failure retains the pending answer for retry", async () => {
    let fail = true;
    const { writes } = setup(async () => { if (fail) throw new TypeError("Network offline"); return { status: 200, body: { success: true } }; });
    fireEvent.change(await screen.findByLabelText("Answer 1"), { target: { value: "Offline answer" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    await screen.findByRole("alert");
    expect(screen.getByLabelText("Answer 1")).toHaveValue("Offline answer");
    expect(screen.queryByText("Thank You!")).not.toBeInTheDocument();
    fail = false;
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    await screen.findByText("Thank You!");
    expect(writes.map(write => write.path)).toEqual(["/api/survey-answer", "/api/survey-answer", "/api/survey-complete"]);
  });

  test("true route unmount cancels the pending answer timer", async () => {
    const { router, writes } = setup();
    fireEvent.change(await screen.findByLabelText("Answer 1"), { target: { value: "Unsent" } });
    await act(async () => { await router.navigate("/away"); });
    await screen.findByText("Other page");
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 1100)); });
    expect(writes).toEqual([]);
  });

  test("identity change cancels the prior respondent's timer", async () => {
    const { changeIdentity, writes } = setup();
    fireEvent.change(await screen.findByLabelText("Answer 1"), { target: { value: "Prior respondent" } });
    await act(async () => { changeIdentity(); });
    expect(screen.getByLabelText("Answer 1")).toHaveValue("");
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 1100)); });
    expect(writes).toEqual([]);
  });
  test("the debounce keeps both questions and the latest edit of the same question", async () => {
    const { writes } = setup();
    const first = await screen.findByLabelText("Answer 1");
    fireEvent.change(first, { target: { value: "Earlier edit" } });
    fireEvent.change(first, { target: { value: "Latest edit" } });
    fireEvent.change(screen.getByLabelText("Answer 2"), { target: { value: "Other question" } });
    await waitFor(() => expect(writes).toHaveLength(2), { timeout: 3000 });
    expect(writes.map(write => [write.fields.questionId, write.fields.answerValue])).toEqual([["Q1", "Latest edit"], ["Q2", "Other question"]]);
  });

  test("an edit during an in-flight save is acknowledged afterwards before completion", async () => {
    const earlier = deferred<Reply>();
    const { writes } = setup(write => write.fields.answerValue === "Earlier edit" ? earlier.promise : Promise.resolve({ status: 200, body: { success: true } }));
    fireEvent.change(await screen.findByLabelText("Answer 1"), { target: { value: "Earlier edit" } });
    await waitFor(() => expect(writes).toHaveLength(1), { timeout: 3000 });
    fireEvent.change(screen.getByLabelText("Answer 1"), { target: { value: "Latest edit" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(writes).toHaveLength(1);
    await act(async () => { earlier.resolve({ status: 200, body: { success: true } }); });
    await screen.findByText("Thank You!");
    expect(writes.map(write => [write.path, write.fields.answerValue])).toEqual([["/api/survey-answer", "Earlier edit"], ["/api/survey-answer", "Latest edit"], ["/api/survey-complete", undefined]]);
  });

  test("unmount aborts an in-flight save and prevents later completion", async () => {
    const saved = deferred<Reply>();
    const { router, writes } = setup(() => saved.promise);
    fireEvent.change(await screen.findByLabelText("Answer 1"), { target: { value: "Pending" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => expect(writes).toHaveLength(1));
    await act(async () => { await router.navigate("/away"); });
    expect(writes[0].signal?.aborted).toBe(true);
    await act(async () => { saved.resolve({ status: 200, body: { success: true } }); });
    expect(writes).toHaveLength(1);
    expect(screen.getByText("Other page")).toBeInTheDocument();
  });

});
