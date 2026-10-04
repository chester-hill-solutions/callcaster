import React from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test, vi } from "vitest";
import SurveyResponsesPage from "../../app/routes/workspaces+/$id/surveys/$surveyId/responses.route";

vi.hoisted(() => { process.env.TZ = "UTC"; });
vi.mock("../../app/routes/workspaces+/$id/surveys/$surveyId/responses.loader.server", () => ({ loader: vi.fn() }));
afterEach(() => { vi.restoreAllMocks(); });

async function showChart({
  values = ["First answer", "Second answer"],
  type = "text",
  singlePage = false,
}: { values?: (string | null)[]; type?: string; singlePage?: boolean } = {}) {
  const pages = (singlePage ? [1] : [1, 2]).map(i => ({
    page_id: `page-${i}`,
    survey_question: [{ id: 100 + i, question_id: "question-1", question_text: `Page ${i} question`, question_type: type }],
  }));
  const response = {
    id: 1, started_at: "2026-10-01T12:00:00Z", created_at: "2026-10-01T12:00:00Z", completed_at: null,
    contact: { firstname: "Ada", surname: "Lovelace" },
    response_answer: values.flatMap((value, i) => value === null ? [] : [{
      id: i + 1, question_id: 101 + i, answer_value: value,
      survey_question: { question_type: type },
    }]),
  };
  const router = createMemoryRouter([{
    path: "/responses", element: <SurveyResponsesPage />,
    loader: () => ({ survey: { title: "Column identity", survey_id: "survey", survey_page: pages },
      responses: [response], workspaceId: "workspace", stats: { total: 1, completed: 0, inProgress: 1, completionRate: 0 } }),
  }], { initialEntries: ["/responses"] });
  render(<RouterProvider router={router} />);
  await userEvent.setup().click(await screen.findByRole("tab", { name: "Chart View" }));
  const table = await screen.findByRole("table");
  const rows = within(table).getAllByRole("row");
  return {
    headers: within(rows[0]).getAllByRole("columnheader").map(cell => cell.textContent),
    cells: within(rows[1]).getAllByRole("cell").map(cell => cell.textContent),
  };
}

describe("survey response columns use saved question identity (#2317)", () => {
  test("repeated public labels keep distinct answers in their columns", async () => {
    const { headers, cells } = await showChart();
    expect(headers).toEqual(["Respondent", "Status", "Started", "Page 1 question", "Page 2 question"]);
    expect(cells).toEqual(["Ada Lovelace", "In Progress", "10/1/2026", "First answer", "Second answer"]);
  });

  test.each([
    { values: ["First answer", null], expected: ["First answer", "-"] },
    { values: [null, "Second answer"], expected: ["-", "Second answer"] },
  ])("an unanswered column does not borrow its neighbor: $expected", async ({ values, expected }) => {
    expect((await showChart({ values })).cells.slice(3)).toEqual(expected);
  });

  test("single-page checkbox results retain their existing display", async () => {
    const { headers, cells } = await showChart({ singlePage: true, type: "checkbox", values: ['["North","South"]'] });
    expect(headers).toEqual(["Respondent", "Status", "Started", "Page 1 question"]);
    expect(cells.slice(3)).toEqual(["North, South"]);
  });

  test("repeated labels do not create duplicate header or answer keys", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    await showChart();
    expect(errors.mock.calls.filter(args => args.some(arg => String(arg).includes("same key")))).toEqual([]);
  });
});
