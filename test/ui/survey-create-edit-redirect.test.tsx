import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, test, vi } from "vitest";

// Regression coverage for audit-C 2a: `/workspaces/:id/surveys/new` and
// `.../edit` used `useSubmit()` with no `fetcher` option to POST/PATCH
// `/api/surveys` — a resource route with an action but no component. That
// performed a *full navigation* to the bare JSON response instead of a
// background fetch, so every successful create/edit stranded the user on a
// blank `/api/surveys` page with no path back to the survey.
//
// Fix: both routes now submit through `useFetcher()` (no navigation) and
// `navigate()` to the survey detail page once the fetcher reports success.
//
// Falsification: swapping `fetcher.submit`/`useFetcher` back for
// `submit`/`useSubmit()` in either route makes these tests fail — the
// memory router ends up on the `/api/surveys` route (no element, i.e. the
// real blank-page bug) instead of the survey detail route.

vi.mock(
  "../../app/routes/workspaces+/$id/surveys/new.loader.server",
  () => ({ loader: vi.fn() }),
);
vi.mock(
  "../../app/routes/workspaces+/$id/surveys/$surveyId/edit.loader.server",
  () => ({ loader: vi.fn() }),
);

describe("survey new/edit routes redirect after a successful mutation", () => {
  test("create: navigates to the new survey's detail page, not the bare /api/surveys response", async () => {
    const NewSurveyPage = (
      await import("../../app/routes/workspaces+/$id/surveys/new.route")
    ).default;

    const router = createMemoryRouter(
      [
        {
          path: "/workspaces/:id/surveys/new",
          element: <NewSurveyPage />,
          loader: () => ({ workspaceId: "ws-1" }),
        },
        {
          path: "/workspaces/:id/surveys/:surveyId",
          element: <div>Survey detail page</div>,
        },
        {
          // Mirrors the real resource route: an action, no component.
          path: "/api/surveys",
          action: async () => ({
            success: true,
            survey: { survey_id: "AuditFix-create-survey" },
          }),
        },
      ],
      { initialEntries: ["/workspaces/ws-1/surveys/new"] },
    );

    render(<RouterProvider router={router} />);

    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Survey ID"), "AuditFix-create-survey");
    await user.type(screen.getByLabelText("Title"), "AuditFix Create Survey");
    await user.click(screen.getByRole("button", { name: /create survey/i }));

    await waitFor(() =>
      expect(screen.getByText("Survey detail page")).toBeInTheDocument(),
    );
    expect(router.state.location.pathname).toBe(
      "/workspaces/ws-1/surveys/AuditFix-create-survey",
    );
  });

  test("edit: navigates back to the survey detail page, not the bare /api/surveys response", async () => {
    const EditSurveyPage = (
      await import("../../app/routes/workspaces+/$id/surveys/$surveyId/edit.route")
    ).default;

    const router = createMemoryRouter(
      [
        {
          path: "/workspaces/:id/surveys/:surveyId/edit",
          element: <EditSurveyPage />,
          loader: () => ({
            survey: { survey_id: "AuditFix-edit-survey" },
            formData: {
              survey_id: "AuditFix-edit-survey",
              title: "AuditFix Edit Survey",
              is_active: false,
              pages: [{ page_id: "page-1", title: "Page 1", page_order: 1, questions: [] }],
            },
            workspaceId: "ws-1",
          }),
        },
        {
          path: "/workspaces/:id/surveys/:surveyId",
          element: <div>Survey detail page</div>,
        },
        {
          path: "/api/surveys",
          action: async () => ({
            success: true,
            survey: { survey_id: "AuditFix-edit-survey" },
          }),
        },
      ],
      { initialEntries: ["/workspaces/ws-1/surveys/AuditFix-edit-survey/edit"] },
    );

    render(<RouterProvider router={router} />);

    const user = userEvent.setup();
    await screen.findByDisplayValue("AuditFix Edit Survey");
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() =>
      expect(screen.getByText("Survey detail page")).toBeInTheDocument(),
    );
    expect(router.state.location.pathname).toBe(
      "/workspaces/ws-1/surveys/AuditFix-edit-survey",
    );
  });
});
