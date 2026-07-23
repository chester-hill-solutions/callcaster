import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";

// Empty results used to render a giant branded h1 billboard. They now mirror
// the populated ResultsScreen chrome with quiet work-surface copy.
describe("app/components/campaign/home/CampaignHomeScreen/CampaignResultDisplay.tsx", () => {
  test("NoResultsYet mirrors results layout with muted empty copy", async () => {
    const { NoResultsYet } = await import(
      "@/components/campaign/home/CampaignHomeScreen/CampaignResultDisplay"
    );
    render(<NoResultsYet expectedTotal={120} />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Call Campaign Results" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Total Calls: 0")).toBeInTheDocument();
    expect(screen.getByText("of 120")).toBeInTheDocument();
    expect(
      screen.getByText("Disposition breakdowns appear here as outreach completes."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Key rates fill in once contacts are reached."),
    ).toBeInTheDocument();
  });

  test("NoResultsYet uses message chrome for message campaigns", async () => {
    const { NoResultsYet } = await import(
      "@/components/campaign/home/CampaignHomeScreen/CampaignResultDisplay"
    );
    render(<NoResultsYet campaignType="message" expectedTotal={40} />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Message Campaign Results" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Total Messages: 0")).toBeInTheDocument();
  });
});
