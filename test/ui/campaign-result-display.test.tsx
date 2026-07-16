import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";

// Regression test for audit-F DESIGN.md violation #2: NoResultsYet used to
// render a raw `<h1 className="...text-gray-400">` — the exact anti-pattern
// DESIGN.md's own Do/Don't example warns against, and a hardcoded color that
// fails contrast in light mode (2.54:1). It now renders through the Heading
// primitive with the branded/token color instead of a raw gray literal.
describe("app/components/campaign/home/CampaignHomeScreen/CampaignResultDisplay.tsx", () => {
  test("NoResultsYet renders its heading as a real h1 with no raw gray color", async () => {
    const { NoResultsYet } = await import(
      "@/components/campaign/home/CampaignHomeScreen/CampaignResultDisplay"
    );
    render(<NoResultsYet />);

    const heading = screen.getByRole("heading", {
      level: 1,
      name: "Your Campaign Results Will Show Here",
    });
    expect(heading).toBeInTheDocument();
    // jsdom doesn't compute layout/contrast, so assert the token-vs-raw-color
    // class distinction directly: no hardcoded Tailwind gray, uses the
    // branded/token treatment the Heading primitive applies instead.
    expect(heading.className).not.toMatch(/text-gray-\d/);
  });
});
