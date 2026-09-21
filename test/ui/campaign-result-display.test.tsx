import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, test } from "vitest";

// Empty results used to render a giant branded h1 billboard. They now mirror
// the populated ResultsScreen chrome with quiet work-surface copy.
describe("app/components/campaign/home/CampaignHomeScreen/CampaignResultDisplay.tsx", () => {
  test("NoResultsYet mirrors results layout with muted empty copy", async () => {
    const { NoResultsYet } =
      await import("@/components/campaign/home/CampaignHomeScreen/CampaignResultDisplay");
    render(<NoResultsYet expectedTotal={120} />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Call Campaign Results" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Contacts Completed: 0")).toBeInTheDocument();
    expect(screen.getByText("of 120")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Disposition breakdowns appear here as outreach completes.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Key rates fill in once contacts are reached."),
    ).toBeInTheDocument();
  });

  test("NoResultsYet uses message chrome for message campaigns", async () => {
    const { NoResultsYet } =
      await import("@/components/campaign/home/CampaignHomeScreen/CampaignResultDisplay");
    render(<NoResultsYet campaignType="message" expectedTotal={40} />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Message Campaign Results",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Total Messages: 0")).toBeInTheDocument();
    // Messages are not contacts: the empty state must not show a contact
    // denominator either.
    expect(screen.queryByText("of 40")).not.toBeInTheDocument();
  });

  test("TotalMessages does not use queue contacts as a message denominator", async () => {
    const { TotalMessages } =
      await import("@/components/campaign/home/CampaignHomeScreen/ResultsScreen.TotalCalls");
    render(<TotalMessages totalMessages={102} />);

    expect(screen.getByText("Total Messages: 102")).toBeInTheDocument();
    expect(screen.queryByText(/of /)).not.toBeInTheDocument();
  });

  // the headline used to mix units — `totalOfAllResults` (attempts) over
  // `queueCounts.fullCount` (contacts) — so a contact attempted twice read
  // "Total Calls: 2 of 1". Both sides are now contacts.
  test("call results headline counts contacts, not attempts", async () => {
    const { ResultsDisplay } =
      await import("@/components/campaign/home/CampaignHomeScreen/CampaignResultDisplay");

    const campaign = { id: 1, type: "robocall" } as never;
    const results = [
      {
        disposition: "completed",
        count: 2,
        average_call_duration: "00:00:00",
        average_wait_time: "00:00:00",
        expected_total: 1,
      },
    ];
    const queueCounts = { fullCount: 1, queuedCount: 0, completedCount: 1 };

    const router = createMemoryRouter(
      [
        {
          path: "/workspaces/:id/campaigns/:selected_id",
          Component: () => (
            <ResultsDisplay
              results={results}
              campaign={campaign}
              hasAccess
              queueCounts={queueCounts}
              ivrResponses={[]}
            />
          ),
        },
      ],
      { initialEntries: ["/workspaces/w1/campaigns/1"] },
    );
    render(<RouterProvider router={router} />);

    expect(screen.getByText("Contacts Completed: 1")).toBeInTheDocument();
    expect(screen.getByText("of 1")).toBeInTheDocument();
    // The attempt count (2) is not the headline numerator.
    expect(screen.queryByText("Total Calls: 2")).not.toBeInTheDocument();
    expect(screen.queryByText("Contacts Completed: 2")).not.toBeInTheDocument();
  });
});
