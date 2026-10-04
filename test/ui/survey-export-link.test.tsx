import React from "react";
import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, test, vi } from "vitest";
import SurveyResponsesPage from "../../app/routes/workspaces+/$id/surveys/$surveyId/responses.route";

vi.mock(
  "../../app/routes/workspaces+/$id/surveys/$surveyId/responses.loader.server",
  () => ({ loader: vi.fn() }),
);

async function showResponses(workspaceId: string, surveyId: string) {
  const router = createMemoryRouter(
    [
      {
        path: "/responses",
        element: <SurveyResponsesPage />,
        loader: () => ({
          survey: { title: "Outreach", survey_id: surveyId, survey_page: [] },
          responses: [],
          workspaceId,
          stats: { total: 0, completed: 0, inProgress: 0, completionRate: 0 },
        }),
      },
    ],
    { initialEntries: ["/responses"] },
  );
  render(<RouterProvider router={router} />);
  return screen.findByRole("link", { name: "Export Data" });
}

describe("survey CSV download action (#2320)", () => {
  test.each([
    {
      workspaceId: "workspace-a",
      surveyId: "survey-a",
      href: "/workspaces/workspace-a/surveys/survey-a/responses/export",
    },
    {
      workspaceId: "workspace-b",
      surveyId: "survey-b",
      href: "/workspaces/workspace-b/surveys/survey-b/responses/export",
    },
  ])(
    "targets the protected export for $workspaceId / $surveyId",
    async ({ workspaceId, surveyId, href }) => {
      const link = await showResponses(workspaceId, surveyId);
      expect(link).toHaveAttribute("href", href);
      expect(link).toHaveAttribute("data-slot", "button");
      expect(link).toHaveAttribute("data-variant", "outline");
      expect(link).not.toHaveAttribute("download");
    },
  );
});
