import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, expect, test, vi } from "vitest";
import SurveyPage from "../../app/routes/survey+/$surveyId";

vi.mock("../../app/routes/survey+/$surveyId.loader.server", () => ({
  loader: vi.fn(),
}));
afterEach(() => vi.unstubAllGlobals());

type Kind = "text" | "textarea" | "radio" | "checkbox";
function setup(kind: Kind = "text", pages = 1, required = true) {
  const writes: { path: string; fields: Record<string, FormDataEntryValue> }[] =
    [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init: RequestInit) => {
      if (!(init.body instanceof FormData))
        throw new Error("Expected survey form data");
      writes.push({
        path: new URL(input, window.location.origin).pathname,
        fields: Object.fromEntries(init.body),
      });
      return Response.json({ success: true });
    }),
  );
  const data = {
    resultId: "required-respondent",
    respondentToken: "signed-respondent",
    contact: null,
    existingResponse: null,
    existingAnswers: {},
    survey: {
      id: 1,
      survey_id: "required-survey",
      title: "Required answers",
      survey_page: Array.from({ length: pages }, (_, index) => ({
        page_id: `page-${index + 1}`,
        title: `Questions ${index + 1}`,
        survey_question: [
          {
            id: index + 1,
            question_id: "repeated-question",
            question_text: "Your answer",
            question_type: kind,
            is_required: required,
            question_option: [
              {
                id: index * 2 + 1,
                option_value: "yes",
                option_label: "Yes",
                option_order: 1,
              },
              {
                id: index * 2 + 2,
                option_value: "other",
                option_label: "Other (write in)",
                option_order: 2,
              },
            ],
          },
        ],
      })),
    },
  };
  const router = createMemoryRouter(
    [{ path: "/survey/:id", element: <SurveyPage />, loader: () => data }],
    { initialEntries: ["/survey/required-survey"] },
  );
  render(<RouterProvider router={router} />);
  return { writes };
}

test("blank required text blocks Next, describes the field and moves focus", async () => {
  const { writes } = setup("text", 2);
  const input = await screen.findByRole("textbox", { name: /Your answer/ });
  await userEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(
    await screen.findByText("Answer this required question."),
  ).toBeVisible();
  expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();
  expect(input).toHaveFocus();
  expect(input).toHaveAccessibleDescription("Answer this required question.");
  expect(input).toHaveAttribute("aria-invalid", "true");
  expect(writes).toEqual([]);
});

test.each(["text", "textarea"] as const)(
  "whitespace required %s blocks final Submit and can be corrected",
  async (kind) => {
    const { writes } = setup(kind);
    const input = await screen.findByRole("textbox", { name: /Your answer/ });
    fireEvent.change(input, { target: { value: "  \t " } });
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(
      await screen.findByText("Answer this required question."),
    ).toBeVisible();
    expect(screen.queryByText("Thank You!")).not.toBeInTheDocument();
    expect(writes.some((write) => write.path === "/api/survey-complete")).toBe(
      false,
    );
    fireEvent.change(input, { target: { value: "A real answer" } });
    expect(
      screen.queryByText("Answer this required question."),
    ).not.toBeInTheDocument();
    expect(input).not.toHaveAttribute("aria-invalid");
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));
    await screen.findByText("Thank You!");
    expect(
      writes.map((write) => [write.path, write.fields.answerValue]),
    ).toEqual([
      ["/api/survey-answer", "A real answer"],
      ["/api/survey-complete", undefined],
    ]);
  },
);

test.each(["radio", "checkbox"] as const)(
  "required %s needs a selection and focuses its first option",
  async (kind) => {
    const { writes } = setup(kind);
    const input = await screen.findByRole(kind, { name: "Yes" });
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(await screen.findByText("Choose an answer.")).toBeVisible();
    expect(input).toHaveFocus();
    expect(input).toHaveAccessibleDescription("Choose an answer.");
    expect(writes).toEqual([]);
    await userEvent.click(input);
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));
    await screen.findByText("Thank You!");
    expect(writes[0].fields.answerValue).toBe(
      kind === "checkbox" ? '["yes"]' : "yes",
    );
  },
);

test("a required question on the second page cannot reuse the first page's answer", async () => {
  const { writes } = setup("text", 2);
  fireEvent.change(
    await screen.findByRole("textbox", { name: /Your answer/ }),
    { target: { value: "First page only" } },
  );
  await userEvent.click(screen.getByRole("button", { name: "Next" }));
  await screen.findByText("Page 2 of 2");
  await userEvent.click(screen.getByRole("button", { name: "Submit" }));
  expect(
    await screen.findByText("Answer this required question."),
  ).toBeVisible();
  expect(writes.map((write) => [write.path, write.fields.pageId])).toEqual([
    ["/api/survey-answer", "page-1"],
  ]);
});

test("an optional answer can stay blank", async () => {
  const { writes } = setup("textarea", 1, false);
  await screen.findByRole("textbox", { name: /Your answer/ });
  await userEvent.click(screen.getByRole("button", { name: "Submit" }));
  await screen.findByText("Thank You!");
  expect(writes.map((write) => write.path)).toEqual(["/api/survey-complete"]);
});

test("valid required answers still wait for their save acknowledgement", async () => {
  let acknowledge: (value: Response) => void = () => {};
  const pending = new Promise<Response>((resolve) => {
    acknowledge = resolve;
  });
  setup();
  let completionRequests = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      if (input.includes("/api/survey-answer")) return pending;
      completionRequests++;
      return Response.json({ success: true });
    }),
  );
  fireEvent.change(
    await screen.findByRole("textbox", { name: /Your answer/ }),
    { target: { value: "Saved before completion" } },
  );
  await userEvent.click(screen.getByRole("button", { name: "Submit" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Submit" })).toBeDisabled(),
  );
  expect(completionRequests).toBe(0);
  await act(async () => {
    acknowledge(Response.json({ success: true }));
  });
  await screen.findByText("Thank You!");
  expect(completionRequests).toBe(1);
});
